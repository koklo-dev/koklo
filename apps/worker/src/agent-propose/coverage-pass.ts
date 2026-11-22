import { AGENT_PROPOSE_LIMITS, type AgentProposalKind } from "@koklo/domain";
import type { ArchitectureCoverage } from "@koklo/schema";
import { isRecord, stringsOf } from "../job-support.ts";
import { ask, type Run, timeUp } from "./call.ts";
import {
  type Complement,
  type CoverageIndex,
  coverageOf,
  type Dependency,
  dependenciesById,
  dependenciesOf,
  dependencyUnion,
  knownComponents,
  type Packet,
  type PublishedProposal,
  packetsOf,
  unionOf,
} from "./coverage.ts";
import { discardReasonOf, OutputInvalidError } from "./errors.ts";
import { linksOf, linksPlan, type ProposedLink } from "./links.ts";
import { coveragePrompt } from "./prompts-coverage.ts";
import type { PublishOutcome } from "./store.ts";
import { tablesPlan, targetOf, updateProposalOf } from "./tables.ts";
import { type Candidate, rememberPublished, triageProposals } from "./triage.ts";
import { proposedComponentId } from "./triage-architecture.ts";
import { batchSchema } from "./zones-pass.ts";

/**
 * Passe de couverture (TK-114b, B616 ; liens TK-114c, B634) et règle des tables (B614) du livrable Architecture, modes
 * `complete` et `all`. Les trous (dont les composants isolés) sont recalculés à chaque passe sur l'index et le lancement ; arrêt à zéro trou (`completed`), ou au plafond
 * (`cap` : 30 appels, 500 propositions, passe complète sans trou comblé).
 */
const COVERAGE_KINDS: readonly AgentProposalKind[] = ["component", "archflow"];
/** Zone de ligne d'un flux technique proposé par la couverture. */
const ARCHFLOW_ZONE = "Flux techniques";
/** Justification d'une proposition `specId` née d'affectations ou de liens (B615, B636). */
const ASSIGNMENT_RATIONALE = "Fonctionnalités et dépendances à rattacher au composant.";

const COVERAGE_SCHEMA = (() => {
  const base = batchSchema(COVERAGE_KINDS);
  const assignment = {
    type: "object",
    additionalProperties: false,
    required: ["feature", "component"],
    properties: { feature: { type: "string" }, component: { type: "string" } },
  };
  const link = {
    type: "object",
    additionalProperties: false,
    required: ["from", "to", "via", "async"],
    properties: {
      from: { type: "string" },
      to: { type: "string" },
      via: { type: "string" },
      async: { type: "boolean" },
    },
  };
  return {
    ...base,
    required: ["assignments", "proposals", "links"],
    properties: {
      assignments: { type: "array", items: assignment },
      links: { type: "array", items: link },
      ...(base.properties as Record<string, unknown>),
    },
  };
})();

interface Assignment {
  readonly feature: string;
  readonly component: string;
}

interface Answer {
  readonly accepted: Candidate[];
  readonly discarded: number;
  readonly assignments: readonly Assignment[];
  readonly links: readonly ProposedLink[];
}

/** Les tables sont rattachées par le code : `owns` est retiré des composants proposés par la couverture. */
const withoutOwns = (entry: unknown): unknown => {
  if (!isRecord(entry) || entry.kind !== "component" || !isRecord(entry.content)) return entry;
  const { owns: _owns, ...content } = entry.content;
  return { ...entry, content };
};

/** Sortie de la couverture : `{ assignments?, proposals, links? }` ; `assignments` ou `links` absent vaut une liste vide. */
function answerOf(raw: unknown, run: Run): Answer {
  if (!isRecord(raw) || !Array.isArray(raw.proposals)) throw new OutputInvalidError();
  const triaged = triageProposals(
    { proposals: (raw.proposals as unknown[]).map(withoutOwns) },
    { ...run.context, kinds: COVERAGE_KINDS },
  );
  const assignments = (Array.isArray(raw.assignments) ? raw.assignments : []).flatMap((item) =>
    isRecord(item) && typeof item.feature === "string" && typeof item.component === "string"
      ? [{ feature: item.feature, component: item.component }]
      : [],
  );
  const accepted = triaged.accepted.map((candidate) => ({
    ...candidate,
    zone: candidate.kind === "component" ? String(candidate.payload.zone) : ARCHFLOW_ZONE,
  }));
  return { accepted, discarded: triaged.discarded, assignments, links: linksOf(raw.links) };
}

type Plan = { creations: Candidate[]; complements: Complement[] };

/** Ajouts d'un appel par composant cible : fonctionnalités servies et dépendances (B616, B636). */
interface Additions {
  readonly serves: Map<string, string[]>;
  readonly dependsOn: Map<string, Dependency[]>;
}

/** Affectations gardées par composant (B616) : trou du paquet, une fois ; composant connu (index, lancement, même réponse). */
function additionsOf(
  answer: Answer,
  packet: Packet,
  isKnown: (component: string) => boolean,
): Map<string, string[]> {
  const holes = new Set(packet.features.map((feature) => feature.specId));
  const additions = new Map<string, string[]>();
  for (const { feature, component } of answer.assignments) {
    if (!holes.has(feature) || !isKnown(component)) continue;
    holes.delete(feature);
    additions.set(component, [...(additions.get(component) ?? []), feature]);
  }
  return additions;
}

/**
 * Ajouts vers une cible déjà publiée ou indexée : un complément, ou UNE proposition `specId` qui réunit `serves` et
 * `dependsOn` (B636). Une cible décidée entre-temps est ignorée (B621). Le complément d'une proposition `specId` sans
 * `dependsOn` part des dépendances de l'index (`current`).
 */
function targetAdditions(
  plan: Plan,
  additions: Additions,
  targetFor: (id: string) => ReturnType<typeof targetOf>,
  current: ReadonlyMap<string, readonly Dependency[]>,
): void {
  for (const id of new Set([...additions.serves.keys(), ...additions.dependsOn.keys()])) {
    const serves = additions.serves.get(id) ?? [];
    const dependsOn = additions.dependsOn.get(id) ?? [];
    const target = targetFor(id);
    if (target?.kind === "pending") {
      const deps = dependsOn.length > 0 ? dependencyUnion(current.get(id) ?? [], dependsOn) : [];
      plan.complements.push({ id: target.proposal.id, owns: [], serves, dependsOn: deps });
    }
    const update =
      target?.kind === "indexed"
        ? updateProposalOf(target.component, { serves, dependsOn }, ASSIGNMENT_RATIONALE)
        : undefined;
    if (update !== undefined) plan.creations.push(update);
  }
}

/** Proposition de la même réponse complétée de ses ajouts, qui sont alors retirés (B616, B636). */
function withAdditions(candidate: Candidate, additions: Additions): Candidate {
  const id = candidate.kind === "component" ? proposedComponentId(candidate.payload) : undefined;
  if (id === undefined) return candidate;
  const serves = additions.serves.get(id);
  const deps = additions.dependsOn.get(id);
  additions.serves.delete(id);
  additions.dependsOn.delete(id);
  const payload = { ...candidate.payload };
  if (serves !== undefined) payload.serves = unionOf(stringsOf(payload.serves), serves);
  if (deps !== undefined)
    payload.dependsOn = dependencyUnion(dependenciesOf(payload.dependsOn), deps);
  return { ...candidate, payload };
}

/** Composants proposés dans la réponse, par identifiant, avec leurs dépendances. */
const freshOf = (answer: Answer): Map<string, Dependency[]> =>
  new Map(
    answer.accepted.flatMap((c) => {
      const id = c.kind === "component" ? proposedComponentId(c.payload) : undefined;
      return id === undefined ? [] : [[id, dependenciesOf(c.payload.dependsOn)] as const];
    }),
  );

/**
 * Plan d'un appel de couverture : propositions gardées (complétées des affectations et des liens qui les visent),
 * compléments, mises à jour ; une seule proposition par composant (B636).
 */
function assignmentPlan(
  index: CoverageIndex,
  proposals: readonly PublishedProposal[],
  packet: Packet,
  answer: Answer,
): Plan {
  const fresh = freshOf(answer);
  const targetFor = (id: string) => targetOf(id, index, proposals);
  const writable = (id: string) => fresh.has(id) || targetFor(id) !== undefined;
  const current = dependenciesById(index, proposals);
  const additions: Additions = {
    serves: additionsOf(answer, packet, writable),
    dependsOn: linksPlan(answer.links, {
      isolated: new Set(packet.components.map((component) => component.specId)),
      dependencies: new Map([...current, ...fresh]),
      writable,
    }),
  };
  const plan: Plan = {
    creations: answer.accepted.map((candidate) => withAdditions(candidate, additions)),
    complements: [],
  };
  targetAdditions(plan, additions, targetFor, current);
  return plan;
}

/**
 * Relit le lancement et réécrit la couverture après une publication ; `stalledOf` : appels consécutifs sans trou comblé,
 * calculés sur la couverture relue (appel de couverture seulement).
 */
export async function recordAfter(
  run: Run,
  index: CoverageIndex,
  stalledOf?: (after: ArchitectureCoverage) => number,
): Promise<void> {
  const proposals = await run.deps.store.launchProposals(run.launch);
  const after = coverageOf(index, proposals);
  await run.deps.store.recordCoverage(run.launch, after.counts, stalledOf?.(after));
}

async function publish(
  run: Run,
  index: CoverageIndex,
  plan: Plan,
  extra: { discarded: number; call: boolean },
  stalledOf?: (after: ArchitectureCoverage) => number,
): Promise<PublishOutcome> {
  const outcome = await run.deps.store.publishCoverage(run.launch, {
    accepted: plan.creations,
    complements: plan.complements,
    ...extra,
  });
  if (outcome === "stopped") return outcome;
  rememberPublished(
    run.context,
    plan.creations.map((candidate) => ({ ...candidate, status: "pending" })),
  );
  await recordAfter(run, index, stalledOf);
  return outcome;
}

/** Règle des tables (B614) : sans appel au modèle ; rien à rattacher, rien n'est écrit. */
export async function linkTables(run: Run, index: CoverageIndex): Promise<PublishOutcome> {
  const plan = tablesPlan(index, await run.deps.store.launchProposals(run.launch));
  if (plan.creations.length === 0 && plan.complements.length === 0) return "published";
  return publish(run, index, plan, { discarded: 0, call: false });
}

/** Trous restants ; un composant isolé relié compte comme un trou comblé (B634). */
const holesOf = (coverage: ArchitectureCoverage) =>
  coverage.unservedFeatures.length +
  coverage.missingFlows.length +
  coverage.isolatedComponents.length;

interface PassState {
  calls: number;
  /** Appels consécutifs sans trou comblé, repris du segment précédent. */
  stalled: number;
}

/** Un appel de couverture sur un paquet ; une sortie écartée (motif fermé) compte l'appel, sans rien publier. */
async function coverageCall(
  run: Run,
  index: CoverageIndex,
  packet: Packet,
  proposals: readonly PublishedProposal[],
  state: PassState,
): Promise<PublishOutcome> {
  const answer = await ask(run, {
    purpose: "proposal-batch",
    prompt: (nonce) =>
      coveragePrompt(nonce, {
        packet,
        components: knownComponents(index, proposals),
        roles: run.sources.roles,
        decisions: (run.sources.architecture?.decisions ?? []).map((item) => item.specId),
        instruction: run.launch.instruction,
      }),
    schema: COVERAGE_SCHEMA,
    parse: (raw) => answerOf(raw, run),
  }).catch((error: unknown): Answer => {
    if (discardReasonOf(error) === undefined) throw error;
    return { accepted: [], discarded: 1, assignments: [], links: [] };
  });
  const before = holesOf(coverageOf(index, proposals));
  const plan = assignmentPlan(index, proposals, packet, answer);
  return publish(run, index, plan, { discarded: answer.discarded, call: true }, (after) => {
    state.stalled = holesOf(after) < before ? 0 : state.stalled + 1;
    return state.stalled;
  });
}

export type CoverageOutcome = "completed" | "cap" | "handoff" | "deadline" | "stopped";

/**
 * Appels successifs jusqu'à zéro trou ou au plafond. Le paquet suivant est celui qui n'a pas encore été tenté depuis le
 * dernier trou comblé : quand chaque paquet a été tenté sans progrès (une passe complète, d'un segment à l'autre), `cap`.
 * Le temps du segment est vérifié avant chaque appel.
 */
export async function coveragePass(run: Run, index: CoverageIndex): Promise<CoverageOutcome> {
  const state: PassState = {
    calls: run.progress.coverageCalls,
    stalled: run.progress.coverageStalled,
  };
  const limits = AGENT_PROPOSE_LIMITS;
  for (;;) {
    const proposals = await run.deps.store.launchProposals(run.launch);
    const coverage = coverageOf(index, proposals);
    if (holesOf(coverage) === 0) return "completed";
    const packets = packetsOf(index, coverage, knownComponents(index, proposals));
    const packet = packets[state.stalled];
    const capped = state.calls >= limits.coverage.calls || proposals.length >= limits.perLaunch;
    if (packet === undefined || capped) return "cap";
    const up = timeUp(run);
    if (up !== undefined) return up;
    state.calls += 1;
    if ((await coverageCall(run, index, packet, proposals, state)) === "stopped") return "stopped";
  }
}

import { AGENT_PROPOSE_LIMITS, type AgentProposalKind } from "@koklo/domain";
import type { ArchitectureCoverage } from "@koklo/schema";
import { isRecord } from "../job-support.ts";
import {
  type Additions,
  type Assignment,
  assignedOf,
  freshOf,
  type Plan,
  targetAdditions,
  withAdditions,
} from "./additions.ts";
import { ask, type Run, timeUp } from "./call.ts";
import {
  actorsById,
  type CoverageIndex,
  coverageOf,
  dependenciesById,
  knownComponents,
  type Packet,
  type PublishedProposal,
  packetsOf,
  type RepriseSkipReason,
} from "./coverage.ts";
import {
  answerTypesOf,
  type Entry,
  entriesOf,
  entryActorsPlan,
  rewriteAnswerFlows,
  rolePacketsOf,
  withAnswerEntries,
} from "./entry-apps.ts";
import { discardReasonOf, OutputInvalidError } from "./errors.ts";
import { linksOf, linksPlan, type ProposedLink } from "./links.ts";
import { coveragePrompt } from "./prompts-coverage.ts";
import { ARCHFLOW_ZONE, coverageCountsOf, repriseContextOf, reprisePlan } from "./reprises.ts";
import type { PublishOutcome } from "./store.ts";
import { tablesPlan, targetOf } from "./tables.ts";
import { type Candidate, rememberPublished, triageProposals } from "./triage.ts";
import { batchSchema } from "./zones-pass.ts";

/**
 * Passe de couverture (TK-114b, B616 ; liens TK-114c, B634) et règle des tables (B614) du livrable Architecture, modes
 * `complete` et `all`. Les trous (dont les composants isolés) sont recalculés à chaque passe sur l'index et le lancement ; arrêt à zéro trou (`completed`), ou au plafond
 * (`cap` : 30 appels, 500 propositions, passe complète sans trou comblé). TK-114d : rôles sans application dans le même appel
 * (`entries`, B653), flux repris en fin d'Architecture (B655, B656).
 */
const COVERAGE_KINDS: readonly AgentProposalKind[] = ["component", "archflow"];

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
  const entry = {
    type: "object",
    additionalProperties: false,
    required: ["role", "component"],
    properties: { role: { type: "string" }, component: { type: "string" } },
  };
  return {
    ...base,
    required: ["assignments", "proposals", "links", "entries"],
    properties: {
      assignments: { type: "array", items: assignment },
      links: { type: "array", items: link },
      entries: { type: "array", items: entry },
      ...(base.properties as Record<string, unknown>),
    },
  };
})();

interface Answer {
  readonly accepted: Candidate[];
  readonly discarded: number;
  readonly assignments: readonly Assignment[];
  readonly links: readonly ProposedLink[];
  readonly entries: readonly Entry[];
}

/** Les tables sont rattachées par le code : `owns` est retiré des composants proposés par la couverture. */
const withoutOwns = (entry: unknown): unknown => {
  if (!isRecord(entry) || entry.kind !== "component" || !isRecord(entry.content)) return entry;
  const { owns: _owns, ...content } = entry.content;
  return { ...entry, content };
};

/** Sortie de la couverture : `{ assignments?, proposals, links?, entries? }` ; une liste absente vaut une liste vide. */
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
  return {
    accepted,
    discarded: triaged.discarded,
    assignments,
    links: linksOf(raw.links),
    entries: entriesOf(raw.entries),
  };
}

/**
 * Plan d'un appel de couverture : propositions gardées (complétées des affectations, des liens et des rôles qui les visent),
 * compléments, mises à jour ; une seule proposition par composant (B636, B653) ; flux de la réponse réécrits (B658).
 */
function assignmentPlan(
  index: CoverageIndex,
  proposals: readonly PublishedProposal[],
  packet: Packet,
  answer: Answer,
): Plan {
  const fresh = freshOf(answer.accepted);
  const targetFor = (id: string) => targetOf(id, index, proposals);
  const writable = (id: string) => fresh.has(id) || targetFor(id) !== undefined;
  const current = dependenciesById(index, proposals);
  const context = repriseContextOf(index, proposals);
  const types = new Map([...context.types, ...answerTypesOf(answer.accepted)]);
  const additions: Additions = {
    serves: assignedOf(answer.assignments, packet, writable),
    dependsOn: linksPlan(answer.links, {
      isolated: new Set(packet.components.map((component) => component.specId)),
      dependencies: new Map([...current, ...fresh]),
      writable,
    }),
    actors: entryActorsPlan(answer.entries, packet, { typeOf: (id) => types.get(id), writable }),
  };
  const rewriting = withAnswerEntries(context, answer.accepted, additions.actors);
  const plan: Plan = {
    creations: rewriteAnswerFlows(
      answer.accepted.map((candidate) => withAdditions(candidate, additions)),
      rewriting,
    ),
    complements: [],
  };
  const actors = actorsById(index, proposals);
  targetAdditions(plan, additions, { targetFor, dependencies: current, actors });
  return plan;
}

/** Ce que la relecture du lancement écrit en plus des compteurs. */
interface RecordOptions {
  /** Appels consécutifs sans trou comblé, calculés sur la couverture relue (appel de couverture seulement). */
  readonly stalledOf?: (after: ArchitectureCoverage) => number;
  /** Motifs des flux non repris (fin d'Architecture seulement, B655). */
  readonly skipped?: ReadonlyMap<RepriseSkipReason, number>;
}

/** Relit le lancement et réécrit la couverture (avec les flux repris) après une publication. */
export async function recordAfter(
  run: Run,
  index: CoverageIndex,
  options: RecordOptions = {},
): Promise<void> {
  const proposals = await run.deps.store.launchProposals(run.launch);
  const after = coverageOf(index, proposals);
  await run.deps.store.recordCoverage(
    run.launch,
    coverageCountsOf(index, proposals, options.skipped),
    options.stalledOf?.(after),
  );
}

async function publish(
  run: Run,
  index: CoverageIndex,
  plan: Plan,
  extra: { discarded: number; call: boolean },
  options?: RecordOptions,
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
  await recordAfter(run, index, options);
  return outcome;
}

/** Règle des tables (B614) : sans appel au modèle ; rien à rattacher, rien n'est écrit. */
export async function linkTables(run: Run, index: CoverageIndex): Promise<PublishOutcome> {
  const plan = tablesPlan(index, await run.deps.store.launchProposals(run.launch));
  if (plan.creations.length === 0 && plan.complements.length === 0) return "published";
  return publish(run, index, plan, { discarded: 0, call: false });
}

/**
 * Flux repris (B655, B656) : sans appel au modèle, après la règle des tables ; les motifs d'écart sont écrits dans le bilan
 * même quand rien n'est repris.
 */
export async function repriseFlows(run: Run, index: CoverageIndex): Promise<PublishOutcome> {
  const { plan, skipped } = reprisePlan(index, await run.deps.store.launchProposals(run.launch));
  if (plan.creations.length > 0 || plan.complements.length > 0)
    return publish(run, index, plan, { discarded: 0, call: false }, { skipped });
  await recordAfter(run, index, { skipped });
  return "published";
}

/** Trous restants ; un composant isolé relié ou un rôle rattaché compte comme un trou comblé (B634, B653). */
const holesOf = (coverage: ArchitectureCoverage) =>
  coverage.unservedFeatures.length +
  coverage.missingFlows.length +
  coverage.isolatedComponents.length +
  coverage.rolesWithoutApp.length;

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
    return { accepted: [], discarded: 1, assignments: [], links: [], entries: [] };
  });
  const before = holesOf(coverageOf(index, proposals));
  const plan = assignmentPlan(index, proposals, packet, answer);
  const stalledOf = (after: ArchitectureCoverage) => {
    state.stalled = holesOf(after) < before ? 0 : state.stalled + 1;
    return state.stalled;
  };
  return publish(run, index, plan, { discarded: answer.discarded, call: true }, { stalledOf });
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
    const known = knownComponents(index, proposals);
    const packets = packetsOf(index, coverage, known, rolePacketsOf(index, proposals));
    const packet = packets[state.stalled];
    const capped = state.calls >= limits.coverage.calls || proposals.length >= limits.perLaunch;
    if (packet === undefined || capped) return "cap";
    const up = timeUp(run);
    if (up !== undefined) return up;
    state.calls += 1;
    if ((await coverageCall(run, index, packet, proposals, state)) === "stopped") return "stopped";
  }
}

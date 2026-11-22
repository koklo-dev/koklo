import type { AgentProposalKind } from "@koklo/domain";
import { ask, type GenerateDeps, type Run, timeUp } from "./call.ts";
import { type CoverageIndex, coverageIndexOf } from "./coverage.ts";
import {
  type CoverageOutcome,
  coveragePass,
  linkTables,
  recordAfter,
  repriseFlows,
} from "./coverage-pass.ts";
import { zonesPrompt } from "./prompts.ts";
import { coverageCountsOf } from "./reprises.ts";
import type { LaunchSources } from "./sources.ts";
import type { LaunchContext, LaunchProgress } from "./store.ts";
import { rememberPublished, type TriageContext, titleKey, zonesOf } from "./triage.ts";
import type { ArchitectureRefs } from "./triage-architecture.ts";
import { zonesPass } from "./zones-pass.ts";

export type { GenerateDeps } from "./call.ts";

/** Issue d'un segment : relais au suivant, fin (`completed`, `cap`), délai épuisé, ou arrêt de l'extérieur. */
export type GenerateOutcome = CoverageOutcome;

/** Types de proposition que chaque mode du Fonctionnel demande (TK-103, B342 : règles, rôles et parcours s'y ajoutent). */
const KINDS_OF_MODE: Readonly<Record<string, readonly AgentProposalKind[]>> = {
  complete: ["feature", "rule", "role", "flow"],
  update: ["feature", "rule", "role", "flow"],
  criteria: ["criteria"],
  all: ["feature", "criteria", "rule", "role", "flow"],
};

/** Données (TK-107, B387) : `complete` et `all` demandent les mêmes trois types, les tables d'abord. */
const DATA_KINDS: readonly AgentProposalKind[] = ["table", "relations", "fixtures"];
/** Longueur maximale d'une zone des Données : celle d'une table (`table.create`). */
const DATA_ZONE_MAX = 80;

/** Architecture (TK-111) : composants et flux (compléter), décision, section du document, ou les quatre (tout reproposer). */
const ARCHITECTURE_KINDS_OF_MODE: Readonly<Record<string, readonly AgentProposalKind[]>> = {
  complete: ["component", "archflow"],
  decision: ["adr"],
  document: ["doc_section"],
  all: ["component", "archflow", "adr", "doc_section"],
};

export const kindsOfMode = (
  mode: string,
  deliverable = "functional",
): readonly AgentProposalKind[] => {
  if (deliverable === "data") return DATA_KINDS;
  if (deliverable === "architecture") {
    return ARCHITECTURE_KINDS_OF_MODE[mode] ?? ARCHITECTURE_KINDS_OF_MODE.complete ?? [];
  }
  return KINDS_OF_MODE[mode] ?? KINDS_OF_MODE.complete ?? [];
};

const ZONES_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["zones"],
  properties: { zones: { type: "array", items: { type: "string" } } },
} as const;

/** Références que le modèle peut viser : fonctionnalités et règles du cahier, tables du modèle actuel. */
const dataRefs = (sources: LaunchSources) => ({
  specIds: new Set([...sources.features, ...sources.rules].map((item) => item.specId)),
  // Champs d'une table actuelle : au plus 100 lus (dossier-sources) ; au plafond, la liste peut être tronquée : non contrôlée.
  tables: new Map<string, ReadonlySet<string> | null>(
    (sources.tables ?? []).map((table) => [
      table.specId,
      table.fields.length >= 100 ? null : new Set(table.fields),
    ]),
  ),
});

/** Références que le modèle peut viser pour l'Architecture : cahier, tables, parcours, rôles, composants et décisions connus. */
const architectureRefs = (sources: LaunchSources): ArchitectureRefs => {
  const ids = (items: readonly { specId: string }[] | undefined) =>
    new Set((items ?? []).map((item) => item.specId));
  const architecture = sources.architecture;
  return {
    features: ids(sources.features),
    rules: ids(sources.rules),
    tables: new Set(sources.tableIds ?? ids(sources.tables)),
    flows: ids(sources.flows),
    roles: ids(sources.roles),
    components: ids(architecture?.components),
    decisions: ids(architecture?.decisions),
    archflows: ids(architecture?.archflows),
    ownedTables: new Set((architecture?.components ?? []).flatMap((item) => item.owns)),
  };
};

/** Contexte de tri d'un segment : titres et références des sources, puis des propositions déjà publiées du lancement. */
function triageContextOf(
  launch: LaunchContext,
  sources: LaunchSources,
  kinds: readonly AgentProposalKind[],
): TriageContext {
  const titles = (items: readonly { title: string }[] | undefined) =>
    new Set((items ?? []).map((item) => titleKey(item.title)));
  const architecture = sources.architecture;
  return {
    kinds,
    titles: {
      feature: titles(sources.features),
      rule: titles(sources.rules),
      role: titles(sources.roles),
      flow: titles(sources.flows),
      table: titles(sources.tables),
      fixtures: titles(sources.fixtures),
      component: titles(architecture?.components),
      archflow: titles(architecture?.archflows),
      adr: titles(architecture?.decisions),
    },
    ...(architecture === undefined ? {} : { arch: architectureRefs(sources) }),
    ...(launch.deliverable === "data" ? { refs: dataRefs(sources) } : {}),
    missingCriteria: new Map(
      sources.features
        .filter((feature) => feature.criteria.length === 0)
        .map((feature) => [feature.specId, feature.title] as const),
    ),
  };
}

/** Couverture et règle des tables : Architecture, modes `complete` et `all` seulement (B616, B618). */
const coverageIndexFor = (launch: LaunchContext, sources: LaunchSources) =>
  launch.deliverable === "architecture" && (launch.mode === "complete" || launch.mode === "all")
    ? coverageIndexOf(sources)
    : undefined;

/** Étape 1, au premier segment : les zones (douze au plus), stockées avec la couverture de l'index avant le lancement. */
async function firstStep(
  run: Run,
  index: CoverageIndex | undefined,
): Promise<readonly string[] | GenerateOutcome> {
  const up = timeUp(run);
  if (up !== undefined) return up;
  const isData = run.launch.deliverable === "data";
  const zones = await ask(run, {
    purpose: "proposal-zones",
    prompt: (nonce) => zonesPrompt(nonce, run.sources, run.launch.instruction),
    schema: ZONES_SCHEMA,
    parse: (raw) => (isData ? zonesOf(raw, DATA_ZONE_MAX) : zonesOf(raw)),
  });
  const before = index === undefined ? undefined : coverageCountsOf(index, []);
  const outcome = await run.deps.store.recordZones(run.launch, zones, before);
  return outcome === "stopped" ? "stopped" : zones;
}

/**
 * Fin de l'Architecture : la règle des tables (B614) puis les flux repris (TK-114d, B656) passent avant toute fin, jamais sur
 * un relais ni un arrêt de l'extérieur.
 */
export async function architectureEnd(
  run: Run,
  index: CoverageIndex,
  outcome: GenerateOutcome,
): Promise<GenerateOutcome> {
  if (outcome === "handoff" || outcome === "stopped") return outcome;
  if ((await linkTables(run, index)) === "stopped") return "stopped";
  return (await repriseFlows(run, index)) === "stopped" ? "stopped" : outcome;
}

/**
 * Un segment d'un lancement (B617) : étape 1, les zones (premier segment) ; étape 2, une zone par appel à partir de la
 * première non traitée, chaque zone publiée aussitôt ; Architecture (`complete`, `all`) : règle des tables puis passe de
 * couverture. Avant chaque appel, un segment qui a épuisé son temps passe le relais (`handoff`) ; au huitième, `deadline`.
 * Une zone écartée est comptée avec son motif ; toute autre erreur interrompt le lancement.
 */
export async function generate(
  deps: GenerateDeps,
  launch: LaunchContext,
  sources: LaunchSources,
  euOnly: boolean,
  progress: LaunchProgress,
): Promise<GenerateOutcome> {
  const kinds = kindsOfMode(launch.mode, launch.deliverable);
  const context = triageContextOf(launch, sources, kinds);
  rememberPublished(context, await deps.store.launchProposals(launch));
  const index = coverageIndexFor(launch, sources);
  const started = deps.now().getTime();
  const run: Run = { deps, launch, sources, euOnly, progress, kinds, context, started };
  const zones = progress.zones.length > 0 ? progress.zones : await firstStep(run, index);
  if (typeof zones === "string") return zones;
  const afterZone = async () => {
    if (index !== undefined) await recordAfter(run, index);
  };
  const outcome = await zonesPass(run, zones, afterZone);
  if (index === undefined) return outcome === "done" ? "completed" : outcome;
  if (outcome !== "done") return architectureEnd(run, index, outcome);
  if ((await linkTables(run, index)) === "stopped") return "stopped";
  return architectureEnd(run, index, await coveragePass(run, index));
}

import { AGENT_PROPOSE_LIMITS, type AgentProposalKind } from "@koklo/domain";
import type { LaunchSources } from "./sources.ts";
import {
  DOCUMENT_ZONE,
  ENVIRONMENTS_ZONE,
  REQUIREMENTS_ZONE,
  STACK_ZONE,
} from "./triage-technical.ts";

/**
 * Étapes du cahier technique (TK-115b, B845), calculées par le code pour que chaque réponse tienne sous le plafond de
 * sortie : la stack couche par couche, les opérations par groupes de zones, puis les exigences, les environnements et le
 * document ; « comparer » avance par groupes de choix ouverts. Pur, sans I/O.
 */
interface StackStep {
  readonly zone: string;
  /** Couche demandée au modèle (vocabulaire anglais des propositions). */
  readonly layer: string;
  /** Types de composant de la couche ; absent : tous. */
  readonly types?: readonly string[];
  /** Vrai si la couche a besoin du modèle de données. */
  readonly tables?: true;
}

/** Toujours la dernière étape Stack : elle voit tous les composants, et sa place dit où finit la stack. */
const OPERATIONS_LAYER: StackStep = {
  zone: "Stack · Hébergement et exploitation",
  layer: "operations",
};
const LAYER_STEPS: readonly StackStep[] = [
  { zone: "Stack · Applications", layer: "applications", types: ["app"] },
  { zone: "Stack · Services et API", layer: "services", types: ["service"], tables: true },
  { zone: "Stack · Données", layer: "data", types: ["store", "queue"], tables: true },
  { zone: "Stack · Services externes", layer: "external", types: ["ext"] },
  OPERATIONS_LAYER,
];

export const stackStepOf = (zone: string): StackStep | undefined =>
  LAYER_STEPS.find((step) => step.zone === zone);

/** Modes à un seul type : « comparer » (la stack) et « rendre mesurables » (les exigences). */
export const SINGLE_KIND: Readonly<Record<string, AgentProposalKind>> = {
  compare: "stack",
  nfr: "nfr",
};
/** Étapes qui suivent les opérations, dans l'ordre. */
const CLOSING: readonly { zone: string; kind: AgentProposalKind }[] = [
  { zone: REQUIREMENTS_ZONE, kind: "nfr" },
  { zone: ENVIRONMENTS_ZONE, kind: "env" },
  { zone: DOCUMENT_ZONE, kind: "doc_section" },
];
const OPERATION_STEPS_MAX = 8;
const DEFAULT_OPERATION_ZONE = "API";
/** Choix ouverts comparés par appel. */
const COMPARE_GROUP = 6;

/** Éléments par groupes de `size`, `max` groupes au plus (le reste attend un autre lancement). */
export const groupsOf = <T>(items: readonly T[], size: number, max: number): T[][] =>
  Array.from({ length: Math.min(max, Math.ceil(items.length / size)) }, (_, i) =>
    items.slice(i * size, (i + 1) * size),
  );

/** Valeurs réparties en `max` groupes au plus, chacun nommé par ses valeurs. */
export function spreadOf(values: readonly string[], max: number): string[] {
  const groups = Math.min(values.length, max);
  const startOf = (i: number) => Math.floor((i * values.length) / groups);
  return Array.from({ length: groups }, (_, i) =>
    values.slice(startOf(i), startOf(i + 1)).join(" · "),
  );
}

/** Noms des étapes d'un travail fait par groupes : `single` pour un seul, sinon « `name` k/n ». */
export const numberedSteps = (name: string, total: number, single = name): string[] =>
  total <= 1 ? [single] : Array.from({ length: total }, (_, i) => `${name} ${i + 1}/${total}`);

/** Rang (0 en tête) d'une étape numérotée, lu dans le nom que le code lui a donné. */
export const stepRankOf = (zone: string): number => Number(/ (\d+)\/\d+$/.exec(zone)?.[1] ?? 1) - 1;

const compareGroups = (sources: LaunchSources) => {
  const open = (sources.technical?.stacks ?? []).filter((stack) => stack.choice === null);
  return groupsOf(open, COMPARE_GROUP, AGENT_PROPOSE_LIMITS.zones);
};

/** Choix ouverts d'une étape « comparer ». */
export const compareChoicesOf = (zone: string, sources: LaunchSources) =>
  compareGroups(sources)[stepRankOf(zone)] ?? [];

const compareSteps = (sources: LaunchSources): string[] =>
  numberedSteps(`${STACK_ZONE} · choix à trancher`, compareGroups(sources).length, STACK_ZONE);

/** Une étape Stack par couche qui a des composants ; l'hébergement et l'exploitation dans tous les cas. */
function stackSteps(sources: LaunchSources): string[] {
  const present = new Set((sources.architecture?.components ?? []).map((item) => item.type));
  return LAYER_STEPS.filter((step) => step.types?.some((type) => present.has(type)) ?? true).map(
    (step) => step.zone,
  );
}

/** Zones des composants, sans doublon, regroupées pour tenir dans les étapes restantes. */
function operationSteps(sources: LaunchSources, room: number): string[] {
  const zones = [
    ...new Set((sources.architecture?.components ?? []).flatMap((item) => item.zone || [])),
  ];
  if (zones.length === 0) return [DEFAULT_OPERATION_ZONE];
  return spreadOf(zones, Math.min(OPERATION_STEPS_MAX, room));
}

export function technicalSteps(mode: string, sources: LaunchSources): string[] {
  if (mode === "compare") return compareSteps(sources);
  if (mode === "nfr") return [REQUIREMENTS_ZONE];
  const stack = stackSteps(sources);
  const room = AGENT_PROPOSE_LIMITS.zones - CLOSING.length - stack.length;
  const operations = operationSteps(sources, room);
  return [...stack, ...operations, ...CLOSING.map((step) => step.zone)];
}

/**
 * Type demandé à l'étape de rang `index`, déduit de sa place dans les zones **stockées** : la stack finit à la première
 * étape d'hébergement (une zone saisie du même nom, placée après, reste une étape d'opérations).
 */
export function technicalKindsAt(
  mode: string,
  index: number,
  zones: readonly string[],
): readonly AgentProposalKind[] {
  const single = SINGLE_KIND[mode];
  if (single !== undefined) return [single];
  // Un lancement parti avant les couches n'a qu'une étape de stack, la première.
  if (index <= Math.max(0, zones.indexOf(OPERATIONS_LAYER.zone))) return ["stack"];
  const closing = CLOSING[index - (zones.length - CLOSING.length)];
  return [closing?.kind ?? "op"];
}

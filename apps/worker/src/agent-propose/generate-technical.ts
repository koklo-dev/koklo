import type { AgentProposalKind } from "@koklo/domain";
import type { LaunchSources } from "./sources.ts";
import { titleKey } from "./title-key.ts";
import {
  DOCUMENT_ZONE,
  ENVIRONMENTS_ZONE,
  REQUIREMENTS_ZONE,
  STACK_ZONE,
  type TechnicalRefs,
} from "./triage-technical.ts";

/**
 * Génération du cahier technique (TK-115, passation 14) : les étapes viennent du code. La stack d'abord, puis les
 * opérations zone par zone (zones des composants), les exigences, les environnements et le document ; « comparer » et
 * « rendre mesurables » n'ont qu'une étape. Chaque étape est publiée aussitôt. Pur, sans I/O.
 */
const ALL_KINDS: readonly AgentProposalKind[] = ["stack", "op", "nfr", "env", "doc_section"];
const SINGLE_STEP: Readonly<Record<string, { zone: string; kind: AgentProposalKind }>> = {
  compare: { zone: STACK_ZONE, kind: "stack" },
  nfr: { zone: REQUIREMENTS_ZONE, kind: "nfr" },
};
/** Étapes qui suivent les opérations, dans l'ordre. */
const CLOSING: readonly { zone: string; kind: AgentProposalKind }[] = [
  { zone: REQUIREMENTS_ZONE, kind: "nfr" },
  { zone: ENVIRONMENTS_ZONE, kind: "env" },
  { zone: DOCUMENT_ZONE, kind: "doc_section" },
];
/** Un lancement compte douze étapes au plus : la stack, huit lots d'opérations et les trois dernières. */
const OPERATION_STEPS_MAX = 8;
const DEFAULT_OPERATION_ZONE = "API";

export const technicalKinds = (mode: string): readonly AgentProposalKind[] => {
  const single = SINGLE_STEP[mode];
  return single === undefined ? ALL_KINDS : [single.kind];
};

/** Zones des composants, sans doublon ; au-delà de huit, regroupées pour tenir dans les douze étapes. */
function operationZones(sources: LaunchSources): string[] {
  const zones = [
    ...new Set((sources.architecture?.components ?? []).flatMap((item) => item.zone || [])),
  ];
  if (zones.length === 0) return [DEFAULT_OPERATION_ZONE];
  const groups = Math.min(zones.length, OPERATION_STEPS_MAX);
  const startOf = (i: number) => Math.floor((i * zones.length) / groups);
  return Array.from({ length: groups }, (_, i) =>
    zones.slice(startOf(i), startOf(i + 1)).join(" · "),
  );
}

export function technicalSteps(mode: string, sources: LaunchSources): string[] {
  const single = SINGLE_STEP[mode];
  if (single !== undefined) return [single.zone];
  return [STACK_ZONE, ...operationZones(sources), ...CLOSING.map((step) => step.zone)];
}

/** Type demandé à l'étape de rang `index` sur `total`, déduit de la position : jamais d'un nom de zone. */
export function technicalKindsAt(
  mode: string,
  index: number,
  total: number,
): readonly AgentProposalKind[] {
  if (SINGLE_STEP[mode] !== undefined) return technicalKinds(mode);
  if (index === 0) return ["stack"];
  const closing = CLOSING[index - (total - CLOSING.length)];
  return [closing?.kind ?? "op"];
}

const idsOf = (items: readonly { specId: string }[] | undefined) =>
  new Set((items ?? []).map((item) => item.specId));

/** Références et éléments existants que le tri du cahier technique confronte aux propositions. */
export function technicalRefs(mode: string, sources: LaunchSources): TechnicalRefs {
  const architecture = sources.architecture;
  const current = sources.technical;
  const requirements = current?.requirements ?? [];
  return {
    mode,
    components: idsOf(architecture?.components),
    features: idsOf(sources.features),
    rules: idsOf(sources.rules),
    decisions: idsOf(architecture?.decisions),
    requirements: new Map(requirements.map((item) => [titleKey(item.title), item.specId])),
    knownRequirements: new Set([...(architecture?.nfr ?? []), ...idsOf(requirements)]),
    stacks: new Map(
      (current?.stacks ?? []).map((stack) => [
        stack.specId,
        { role: stack.role, open: stack.choice === null },
      ]),
    ),
    operations: idsOf(current?.operations),
    environments: idsOf(current?.environments),
    docSections: new Map(
      (sources.docSections ?? []).map((section) => [section.specId, section.empty === true]),
    ),
  };
}

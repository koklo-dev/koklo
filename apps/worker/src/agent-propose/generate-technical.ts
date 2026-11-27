import type { AgentProposalKind } from "@koklo/domain";
import type { LaunchSources } from "./sources.ts";
import { SINGLE_KIND } from "./technical-steps.ts";
import { titleKey } from "./title-key.ts";
import type { TechnicalRefs } from "./triage-technical.ts";

/**
 * Génération du cahier technique (TK-115, passation 14) : types demandés par mode et références que le tri confronte aux
 * propositions. Les étapes sont calculées dans `technical-steps.ts`. Pur, sans I/O.
 */
const ALL_KINDS: readonly AgentProposalKind[] = ["stack", "op", "nfr", "env", "doc_section"];

export const technicalKinds = (mode: string): readonly AgentProposalKind[] => {
  const single = SINGLE_KIND[mode];
  return single === undefined ? ALL_KINDS : [single];
};

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

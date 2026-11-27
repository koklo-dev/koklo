import type { AiProposeOptionsOutput, SpecDeliverablesOutput } from "@koklo/contract";
import { AGENT_READS } from "@koklo/domain";
import { validation } from "../tracker/api-errors.ts";
import type { NewLaunch, TechnicalFacts } from "./launch.repository.ts";

/**
 * Lancement du cahier technique (TK-115, passation 14 §2-§3, B727) : quatre modes, livrable ouvert et au moins un
 * composant. Les options à traiter sans rien à traiter sont omises ; seul le compte des choix à trancher est calculé.
 */
const MODES: readonly string[] = ["complete", "compare", "nfr", "all"];

export function technicalOptions(
  facts: TechnicalFacts,
  deliverables: SpecDeliverablesOutput["deliverables"],
): AiProposeOptionsOutput {
  const validated = deliverables.some(
    (entry) => entry.key === "architecture" && entry.status === "validated",
  );
  const listed: AiProposeOptionsOutput["options"] = [
    { id: "complete", recommended: true },
    ...(facts.openChoices > 0
      ? [{ id: "compare" as const, count: facts.openChoices, recommended: false }]
      : []),
    ...(facts.requirements > 0 ? [{ id: "nfr" as const, recommended: false }] : []),
    { id: "all", recommended: false },
  ];
  return {
    options: listed,
    // « L'agent lit » de la maquette 14 ; AGENT_READS.technical reste le contexte réel de l'agent.
    reads: [
      { id: "architecture.current", label: validated ? "Architecture validée" : "Architecture" },
      { id: "nfr.known", label: "Exigences" },
    ],
    available: true,
  };
}

const EMPTY_MODE: Readonly<Record<string, [keyof TechnicalFacts, string]>> = {
  compare: ["openChoices", "Aucun choix à trancher : rien à comparer."],
  nfr: ["requirements", "Aucune exigence : rien à rendre mesurable."],
};

/** Refuse un lancement impossible ; rend ce que l'API fixe à sa création. */
export function technicalDraft(
  input: { mode: string; instruction?: string },
  facts: TechnicalFacts,
  deliverables: SpecDeliverablesOutput["deliverables"],
): NewLaunch {
  if (!MODES.includes(input.mode)) {
    throw validation("mode", "Ce mode n'existe pas pour le Technique.");
  }
  if (deliverables.find((entry) => entry.key === "technical")?.available !== true) {
    throw validation(
      "deliverable",
      "Le technique s'ouvre quand l'architecture est validée : validez-la, ou ouvrez le livrable.",
    );
  }
  if (facts.components === 0) {
    throw validation(
      "deliverable",
      "L'architecture est vide : enregistrez au moins un composant avant de proposer le cahier technique.",
    );
  }
  const [fact, message] = EMPTY_MODE[input.mode] ?? [];
  if (fact !== undefined && facts[fact] === 0) throw validation("mode", message ?? "");
  return {
    deliverable: "technical",
    mode: input.mode,
    instruction: input.instruction ?? null,
    sources: AGENT_READS.technical,
    baseVersion: null,
  };
}

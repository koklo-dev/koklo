import type { AiProposeOptionsOutput, SpecDeliverablesOutput } from "@koklo/contract";
import { AGENT_READS, SECURITY_MODES } from "@koklo/domain";
import { validation } from "../tracker/api-errors.ts";
import type { NewLaunch, SecurityFacts } from "./launch.repository.ts";

/**
 * Lancement de la Sécurité (TK-117, passation 21 §4, B806) : quatre modes, livrable ouvert (B755). Une option dont le
 * compte est nul est masquée ; « exigences » reste proposé sans compte quand rien n'est listé ou répondu, le résumé
 * toujours ; la première option listée est recommandée.
 */
type Option = AiProposeOptionsOutput["options"][number];

/** « L'agent lit » de la maquette 15 ; `AGENT_READS.security` reste le contexte réel de l'agent. */
const WINDOW_READS = [
  { id: "functional.features", label: "Fonctionnalités exposées" },
  { id: "data.tables", label: "Modèle de données" },
  { id: "technical.current", label: "Cahier technique" },
];

const counted = (id: Option["id"], count: number): Omit<Option, "recommended">[] =>
  count > 0 ? [{ id, count }] : [];

export function securityOptions(facts: SecurityFacts): AiProposeOptionsOutput {
  const listed: Omit<Option, "recommended">[] = [
    ...counted("threats", facts.surfaces),
    ...counted("classify", facts.unclassified),
    { id: "asvs", ...(facts.unanswered > 0 ? { count: facts.unanswered } : {}) },
    { id: "summary" },
  ];
  return {
    options: listed.map((option, index) => ({ ...option, recommended: index === 0 })),
    reads: WINDOW_READS,
    available: true,
  };
}

const EMPTY_MODE: Readonly<Record<string, [keyof SecurityFacts, string]>> = {
  threats: ["surfaces", "Chaque surface exposée a ses menaces et ses parades : rien à proposer."],
  classify: ["unclassified", "Tous les champs du modèle sont classés : rien à classer."],
};

/** Refuse un lancement impossible ; rend ce que l'API fixe à sa création. */
export function securityDraft(
  input: { mode: string; instruction?: string | undefined },
  facts: SecurityFacts,
  deliverables: SpecDeliverablesOutput["deliverables"],
): NewLaunch {
  if (!(SECURITY_MODES as readonly string[]).includes(input.mode)) {
    throw validation("mode", "Ce mode n'existe pas pour la Sécurité.");
  }
  if (deliverables.find((entry) => entry.key === "security")?.available !== true) {
    throw validation(
      "deliverable",
      "La sécurité s'ouvre quand le technique est validé : validez-le, ou ouvrez le livrable.",
    );
  }
  const [fact, message] = EMPTY_MODE[input.mode] ?? [];
  if (fact !== undefined && facts[fact] === 0) throw validation("mode", message ?? "");
  return {
    deliverable: "security",
    mode: input.mode,
    instruction: input.instruction ?? null,
    sources: AGENT_READS.security,
    baseVersion: null,
  };
}

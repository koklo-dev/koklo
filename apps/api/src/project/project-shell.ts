import type { DELIVERABLE_KEYS } from "@koklo/contract";

/**
 * Dérivations pures de la coquille (TK-88, B77). Rien n'est inventé : la disponibilité des livrables
 * vient de l'index de la spec tant que `spec.deliverables` (TK-100) n'existe pas ; il la remplacera.
 */
export type DeliverableKey = (typeof DELIVERABLE_KEYS)[number];
export type ProjectPhase = "idea" | "framing" | "iterations";

export interface Deliverable {
  key: DeliverableKey;
  available: boolean;
  after: string | null;
}

export interface ShellFacts {
  /** Fonctionnalités de l'instantané courant de la spec (0 sans dépôt ni index). */
  featureCount: number;
  /** Baselines `validated` ou `tagged`. */
  validatedBaselines: number;
  /** Versions `idea-vN` dont le lot est commité (TK-91, B260). */
  ideaVersions: number;
}

/** Ce qui précède un livrable, dit à l'utilisateur quand il est verrouillé (« Disponible après … »). */
const AFTER: Record<DeliverableKey, string | null> = {
  functional: null,
  data: "le fonctionnel",
  architecture: "les données",
  technical: "l'architecture",
  security: "le technique",
  design: "le fonctionnel",
  quality: "le technique, la sécurité et le design",
};

/** Livrables que l'index suffit à ouvrir : dès qu'une fonctionnalité est enregistrée (B77). */
const OPENED_BY_FEATURES: readonly DeliverableKey[] = ["data", "design"];

/** Ordre de rédaction de la spec (passation 21 §0 : Sécurité en 5e). */
const ORDER: readonly DeliverableKey[] = [
  "functional",
  "data",
  "architecture",
  "technical",
  "security",
  "design",
  "quality",
];

/** `idea` tant qu'aucune version `idea-vN` n'est commitée et qu'aucune fonctionnalité n'existe ; `framing` ensuite. */
export function phaseOf({
  featureCount,
  validatedBaselines,
  ideaVersions,
}: ShellFacts): ProjectPhase {
  if (featureCount === 0 && ideaVersions === 0) return "idea";
  return validatedBaselines > 0 ? "iterations" : "framing";
}

export function deliverablesOf({ featureCount }: ShellFacts): Deliverable[] {
  return ORDER.map((key) => ({
    key,
    available: key === "functional" || (featureCount > 0 && OPENED_BY_FEATURES.includes(key)),
    after: AFTER[key],
  }));
}

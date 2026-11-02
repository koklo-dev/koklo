import type { aiProposedFeatureSchema } from "@koklo/contract";
import type { z } from "zod";

/** Une fonctionnalité telle que l'API la propose (`ai.proposeFeatures`) : acceptée telle quelle par `specBatch.submit`. */
export type ProposedFeature = z.infer<typeof aiProposedFeatureSchema>;
export type ProposalStatus = "to_review" | "accepted" | "rejected";

/** Une proposition de la session de cadrage : jamais d'identifiant côté API (D4), `id` est local. */
export interface FramingProposal {
  id: string;
  status: ProposalStatus;
  /** Valeur courante (éditions comprises). */
  value: ProposedFeature;
  /** Valeur reçue de l'API : « Annuler les modifications » y revient. */
  original: ProposedFeature;
  /** `F-nnn` signalé par l'API (titre déjà présent) ; validé, jamais du texte libre. */
  duplicateOf: string | null;
}

/** Champs du brief éditable (étape 2) ; `openQuestions` : une question par ligne. */
export interface BriefFields {
  title: string;
  problem: string;
  users: string;
  expectedOutcome: string;
  constraints: string;
  openQuestions: string;
}

/** Contenu du brouillon local `koklo:framing-draft:<projectId>`. */
export interface FramingDraft {
  mode: "idea" | "brief";
  idea: string;
  /** Précisions, une par ligne. */
  clarifications: string;
  /** Brief collé (chemin « J'ai déjà un brief »). */
  pastedBrief: string;
  /** Brief structuré édité ; `null` tant qu'aucun brief n'est produit. */
  brief: BriefFields | null;
  /** Réponses aux questions ouvertes, dans l'ordre des questions. */
  answers: string[];
  proposals: FramingProposal[];
  /** Date ISO de la dernière sauvegarde. */
  savedAt: string;
}

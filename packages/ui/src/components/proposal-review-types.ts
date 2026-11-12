import type { IconName } from "../icons/icon.tsx";

/** État d'une proposition : `blocked` = liée à un lot d'enregistrement échoué (à reprendre par l'équipe technique). */
export type ProposalStatus = "pending" | "accepted" | "rejected" | "blocked";

/** Décisions que l'écran peut prendre : `pending` remet à relire. */
export type ProposalDecision = "accepted" | "rejected" | "pending";

export type ProposalFilter = "pending" | "all";

/** Avancement d'un enregistrement découpé en lots : `saved` propositions écrites, `sending` dans le lot en cours. */
export interface ProposalSaveProgress {
  saved: number;
  sending: number;
  total: number;
  /** Rang du lot en cours (1 pour le premier) et nombre de lots. */
  batch: number;
  batches: number;
}

/** Au-delà de ce nombre de propositions, la liste se range en groupes repliables (passation 07 §1.4). */
export const PROPOSAL_GROUP_THRESHOLD = 30;

/** Éléments chargés d'abord par groupe, puis par « Afficher 20 de plus ». */
export const PROPOSAL_FIRST_PAGE = 8;
export const PROPOSAL_NEXT_PAGE = 20;

export interface ProposalReviewItem {
  id: string;
  /** Identifiant lisible (« F-012 »), en police mono. */
  ref: string;
  title: string;
  /** Ligne secondaire (« Fonctionnalité · Haute · 2 critères »). */
  subtitle?: string;
  status: ProposalStatus;
}

export interface ProposalReviewGroup {
  key: string;
  label: string;
  /** Comptes du groupe, tous états confondus (sous-ligne de l'en-tête). */
  counts: { total: number; accepted: number; pending: number };
  /** Total du groupe pour le filtre courant : `aria-setsize` et « N restantes ». */
  matching: number;
  /** Éléments chargés pour le filtre courant. */
  items: readonly ProposalReviewItem[];
}

export interface ProposalReviewCounts {
  total: number;
  accepted: number;
  rejected: number;
  pending: number;
}

export const PROPOSAL_STATE: Record<
  ProposalStatus,
  { label: string; icon: IconName; fill: boolean; tone?: "primary" | "muted" | "danger" }
> = {
  pending: { label: "À relire", icon: "schedule", fill: false, tone: "muted" },
  accepted: { label: "Acceptée", icon: "check_circle", fill: true, tone: "primary" },
  rejected: { label: "Rejetée", icon: "cancel", fill: false, tone: "muted" },
  blocked: { label: "Enregistrement échoué", icon: "error", fill: true, tone: "danger" },
};

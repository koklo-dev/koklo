import type { TicketStatus } from "@koklo/contract";

export const SEARCH_REPOSITORY = Symbol("SEARCH_REPOSITORY");

export interface SearchRequest {
  organizationId: string;
  userId: string;
  q: string;
  /** Projet courant (déjà contrôlé) ; sans lui, seuls les projets sont cherchés. */
  projectId?: string;
  /** `null` : toute l'organisation ; sinon les seuls projets liés. */
  linkedProjectIds: readonly string[] | null;
  /** Fonctionnalités et contenu de spec : jamais pour un rôle cloisonné (D7). */
  includeFeatures: boolean;
  limit: number;
}

export type SearchHit =
  | { kind: "project"; id: string; name: string }
  | { kind: "feature"; projectId: string; specId: string; title: string }
  | {
      kind: "ticket";
      projectId: string;
      key: string;
      title: string;
      status: TicketStatus;
    };

/** `items` : au plus `limit` résultats (projets, puis fonctionnalités, puis tickets) ; `total` : le vrai total. */
export interface SearchOutcome {
  items: SearchHit[];
  total: number;
}

export interface SearchRepository {
  search(request: SearchRequest): Promise<SearchOutcome>;
}

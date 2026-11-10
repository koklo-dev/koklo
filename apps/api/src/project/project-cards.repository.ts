import type { Audience, CardFacts } from "./project-cards.ts";

export const PROJECT_CARDS_REPOSITORY = Symbol("PROJECT_CARDS_REPOSITORY");

export interface CardsRequest {
  organizationId: string;
  audience: Audience;
  /** `null` : toute l'organisation ; sinon les seuls projets visibles (client lié, `[]` : aucun). */
  visibleProjectIds: readonly string[] | null;
  /** Lire l'état de l'IA : réservé à owner et admin (règle « IA non configurée »). */
  withAi: boolean;
  /** Owner ou admin : seuls à relancer la création d'un dépôt (`creation.canAct`). */
  canAct: boolean;
}

export interface CardsRead {
  facts: CardFacts[];
  aiConfigured: boolean | null;
}

/**
 * Port de lecture de la liste en cartes. Chaque famille de faits se lit en UNE requête sur l'ensemble
 * des projets visibles (`projectId in (...)`) : jamais une requête par projet (B299). Le port n'a
 * aucune méthode sans organisation.
 */
export interface ProjectCardsRepository {
  read(request: CardsRequest): Promise<CardsRead>;
}

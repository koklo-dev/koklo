import type { IdeaPageStatus } from "@koklo/domain";
import type { ProjectScope } from "../tracker/scope.ts";
import type { IdeaProposalRecord } from "./idea-proposal.repository.ts";

export const IDEA_REPOSITORY = Symbol("IDEA_REPOSITORY");

export type IdeaOrigin = "template" | "user" | "agent";

/** Qui a modifié la page : un nom et un indicateur client, jamais l'identifiant ni l'e-mail. */
export interface IdeaAuthor {
  name: string;
  isClient: boolean;
}

export interface IdeaPageRecord {
  id: string;
  slug: string;
  title: string;
  position: number;
  required: boolean;
  origin: IdeaOrigin;
  status: IdeaPageStatus;
  version: number;
  updatedAt: Date;
  updatedBy: IdeaAuthor | null;
  deletedAt: Date | null;
  /** Absent des listes : aucune requête de liste ne charge le contenu. */
  contentMd?: string;
  /** Propositions en attente sur la page : leur nombre (liste) ou leur détail (`get`) ; absent ailleurs. */
  pendingProposals?: number;
  proposals?: IdeaProposalRecord[];
}

export interface IdeaListing {
  pages: IdeaPageRecord[];
  trash: IdeaPageRecord[];
  /** Le dépôt de spec existe : « Enregistrer une version » est possible (le fournisseur est vérifié par le service). */
  hasSpecRepo: boolean;
  lastPublication: { commitSha: string; publishedAt: Date } | null;
  /** Propositions de page (`create_page`) en attente : elles n'ont pas encore de page. */
  pendingPageProposals: IdeaProposalRecord[];
}

export interface IdeaActor {
  role: string;
  now: Date;
}

export interface IdeaPresent {
  userId: string;
  name: string;
  isClient: boolean;
  pageId: string | null;
}

/** Instantané du dossier pour le lot de publication (contenus, contributeurs, pages à retirer). */
export interface IdeaSnapshot {
  pages: (IdeaPageRecord & {
    contentMd: string;
    contributorNames: string[];
  })[];
  /** Slugs en corbeille déjà publiés lors de la dernière publication : le dépôt doit les retirer. */
  removedSlugs: string[];
  contributorUserIds: string[];
}

/**
 * Dossier d'idée d'un projet. Chaque méthode est une transaction (écriture, contributeurs, audit).
 * Refus typés levés depuis la transaction : `NOT_FOUND`, `CONFLICT` (+ `currentVersion`), `VALIDATION`,
 * `FORBIDDEN` (page requise).
 */
export interface IdeaRepository {
  list(scope: ProjectScope, now: Date): Promise<IdeaListing>;
  /** Page active, ou en corbeille depuis 30 jours au plus ; sinon `NOT_FOUND`. */
  get(scope: ProjectScope, pageId: string, now: Date): Promise<IdeaPageRecord>;
  save(
    scope: ProjectScope,
    actor: IdeaActor,
    pageId: string,
    baseVersion: number,
    contentMd: string,
  ): Promise<IdeaPageRecord>;
  setStatus(
    scope: ProjectScope,
    actor: IdeaActor,
    pageId: string,
    status: "draft" | "review" | "stable",
  ): Promise<IdeaPageRecord>;
  createPage(
    scope: ProjectScope,
    actor: IdeaActor,
    input: { title: string; afterPageId?: string | undefined },
  ): Promise<IdeaPageRecord>;
  rename(
    scope: ProjectScope,
    actor: IdeaActor,
    pageId: string,
    title: string,
  ): Promise<IdeaPageRecord>;
  reorder(scope: ProjectScope, actor: IdeaActor, pageIds: string[]): Promise<IdeaPageRecord[]>;
  remove(scope: ProjectScope, actor: IdeaActor, pageId: string): Promise<IdeaPageRecord>;
  restore(scope: ProjectScope, actor: IdeaActor, pageId: string): Promise<IdeaPageRecord>;
  /** Pose la présence (page ouverte) puis rend les présents (vus depuis moins de 45 s). */
  touchPresence(scope: ProjectScope, pageId: string | null, now: Date): Promise<IdeaPresent[]>;
  snapshot(scope: ProjectScope): Promise<IdeaSnapshot>;
}

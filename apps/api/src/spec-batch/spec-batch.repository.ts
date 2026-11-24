import type { ProjectScope } from "../tracker/scope.ts";
import type { SpecGitTarget } from "./spec-head-paths.ts";

export const SPEC_BATCH_REPOSITORY = Symbol("SPEC_BATCH_REPOSITORY");

export type BatchStatus = "queued" | "committing" | "committed" | "failed" | "conflict";

/** Opération telle que soumise, normalisée : `specId` est nul pour une création (attribué au submit). */
export interface PreparedOperation {
  kind: string;
  specId: string | null;
  payload: Record<string, unknown>;
}

/** Lot validé à l'entrée, prêt à être enregistré (branche résolue, chemins déjà contrôlés). */
export interface PreparedBatch {
  idempotencyKey: string;
  branch: string;
  baseSha: string | null;
  message: string | null;
  operations: PreparedOperation[];
  /**
   * Propositions de l'agent que le lot applique (TK-99a) : `accepted`, du projet, pas encore appliquées ou tenues par un lot
   * du projet en échec (`failed`, `conflict` : TK-114e, B673).
   */
  proposalIds?: readonly string[];
  /** Propositions écartées par la pré-vérification (TK-114e, B672) : remises à relire dans la transaction du lot. */
  returnedProposalIds?: readonly string[];
}

export interface BatchRecord {
  id: string;
  repoId: string;
  branch: string;
  status: BatchStatus;
  idempotencyKey: string;
  baseSha: string | null;
  commitSha: string | null;
  errorCode: string | null;
  report: unknown;
  message: string | null;
  enqueuedAt: Date;
  committedAt: Date | null;
  operations: { position: number; kind: string; specId: string | null; payload: unknown }[];
}

export interface SpecBatchPlan {
  repoId: string;
  defaultBranch: string;
}

/** Résultat de l'enregistrement : lot créé, lot rejoué (même clé, même contenu) ou clé réutilisée. */
export type CreateOutcome =
  | { kind: "created" | "replayed"; batch: BatchRecord }
  | { kind: "reused"; batchId: string };

/** Accès aux lots du projet ; chaque méthode est une requête ou une transaction courte, sans réseau. */
export interface SpecBatchRepository {
  /** Repo porteur de la spec ; `NOT_FOUND` si le projet n'est pas de l'organisation ou sans dépôt de spec. */
  plan(scope: ProjectScope): Promise<SpecBatchPlan>;
  /**
   * UNE transaction : lot, opérations, attribution des F-nnn (compteur du projet) et audit. Une clé
   * déjà connue rend le lot existant sans rien écrire.
   */
  create(
    scope: ProjectScope,
    role: string,
    plan: SpecBatchPlan,
    batch: PreparedBatch,
  ): Promise<CreateOutcome>;
  /** Lot du projet (`batchId` d'un autre projet : `null`), avec vérification du projet. */
  find(scope: ProjectScope, batchId: string): Promise<BatchRecord | null>;
  /** Relecture de l'attente : une simple requête, sans transaction. */
  poll(scope: ProjectScope, batchId: string): Promise<BatchRecord | null>;
  /** Lot du projet enregistré sous cette clé d'idempotence, sinon `null` (rejeu d'un enregistrement pré-vérifié). */
  findByKey(scope: ProjectScope, idempotencyKey: string): Promise<BatchRecord | null>;
  /** Où lire la spec dans git (pré-vérification, TK-114e) ; `NOT_FOUND` sans dépôt de spec. */
  gitTarget(scope: ProjectScope): Promise<SpecGitTarget>;
  /**
   * Propositions écartées remises à relire (`pending`, `appliedBatchId` nul), UNE transaction, sans ligne de décision :
   * chacune doit être acceptée, du projet, libre ou tenue par un lot du projet en échec ; sinon 422 et rien ne change.
   */
  returnToReview(scope: ProjectScope, ids: readonly string[]): Promise<void>;
}

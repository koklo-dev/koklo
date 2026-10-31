import type { ProjectScope } from "../tracker/scope.ts";

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
}

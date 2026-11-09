import type { ProjectScope } from "../tracker/scope.ts";
import type { IdeaSynthesisRecord } from "./idea.repository.ts";

export const IDEA_FREEZE_REPOSITORY = Symbol("IDEA_FREEZE_REPOSITORY");

/** Un passage au cadrage déjà enregistré sous une clé d'idempotence. */
export interface FrozenLot {
  batchId: string;
  tag: string;
  /** Le lot porte une Synthèse (`idea.synthesis.write`). */
  hasSynthesis: boolean;
}

export interface AllocatedVersion {
  id: string;
  number: number;
  tag: string;
}

/**
 * Versions figées `idea-vN` d'un projet (TK-91). Le numéro est alloué AVANT l'appel du modèle (il nomme la Synthèse
 * et le tag) puis rattaché au lot ; une version dont le lot échoue disparaît (voir `reconcileIdeaVersions`).
 */
export interface IdeaFreezeRepository {
  /** Le passage déjà fait avec cette clé (rejeu), ou `null`. */
  byKey(scope: ProjectScope, idempotencyKey: string): Promise<FrozenLot | null>;
  /**
   * Alloue le numéro suivant (max + 1). Un autre passage en cours, ou une course sur le numéro, est
   * `SPEC_BATCH_CONFLICT` (`write_conflict`, avec le lot en cours s'il existe).
   */
  allocate(
    scope: ProjectScope,
    input: { pagesVersions: Record<string, number>; now: Date },
  ): Promise<AllocatedVersion>;
  /** Rattache la version à son lot, mémorise la Synthèse portée par ce lot et journalise `idea.freeze` (une transaction). */
  attach(
    scope: ProjectScope,
    input: { versionId: string; batchId: string; synthesis: IdeaSynthesisRecord | null },
  ): Promise<void>;
  /** Rend le numéro : le lot n'a pas pu être enregistré. */
  release(scope: ProjectScope, versionId: string): Promise<void>;
}

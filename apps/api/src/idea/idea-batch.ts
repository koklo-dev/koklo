import { SCOPING_BRANCH } from "@koklo/domain";
import type { PreparedBatch, PreparedOperation } from "../spec-batch/spec-batch.repository.ts";
import type { IdeaSnapshot } from "./idea.repository.ts";

/**
 * Lot de publication de l'espace Idée (TK-89, lot A) : un instantané du dossier, exécuté par le worker
 * (lot B). Une opération `idea.page.write` par page active, `idea.page.delete` pour les pages déjà
 * publiées puis retirées, `idea.index.write` pour la structure. Le payload ne porte jamais d'e-mail :
 * les contributeurs de l'index sont des identifiants, que le worker résout en base.
 */
export const IDEA_OPERATION_KINDS = ["idea.page.write", "idea.page.delete", "idea.index.write"];

export const isIdeaOperation = (kind: string): boolean => IDEA_OPERATION_KINDS.includes(kind);

export function buildIdeaBatch(
  snapshot: IdeaSnapshot,
  idempotencyKey: string,
  branch: string = SCOPING_BRANCH,
): PreparedBatch {
  const writes: PreparedOperation[] = snapshot.pages.map((page) => ({
    kind: "idea.page.write",
    specId: null,
    payload: {
      slug: page.slug,
      title: page.title,
      status: page.status,
      required: page.required,
      origin: page.origin,
      mis_a_jour: page.updatedAt.toISOString(),
      contributeurs: page.contributorNames,
      contentMd: page.contentMd,
    },
  }));
  const removals: PreparedOperation[] = snapshot.removedSlugs.map((slug) => ({
    kind: "idea.page.delete",
    specId: null,
    payload: { slug },
  }));
  const index: PreparedOperation = {
    kind: "idea.index.write",
    specId: null,
    payload: {
      pages: snapshot.pages.map((page) => ({
        slug: page.slug,
        title: page.title,
        position: page.position,
        required: page.required,
        origin: page.origin,
        status: page.status,
      })),
      contributorUserIds: snapshot.contributorUserIds,
      pagesVersions: Object.fromEntries(snapshot.pages.map((page) => [page.slug, page.version])),
    },
  };
  return {
    idempotencyKey,
    branch,
    baseSha: null,
    message: null,
    operations: [...writes, ...removals, index],
  };
}

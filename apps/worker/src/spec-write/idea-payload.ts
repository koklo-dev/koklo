import type { IdeaPageFile, IdeaPageFileOrigin, IdeaPageFileStatus } from "@koklo/schema";
import { isRecord } from "../job-support.ts";

/**
 * Charges des opérations `idea.*` (TK-89), relues en base : le worker ne fait confiance à aucune
 * forme. Chaque lecteur rend `undefined` si le payload est douteux (le lot échoue en `INTERNAL`
 * avant tout appel au fournisseur). Aucun e-mail : les contributeurs de l'index sont des identifiants.
 */
const SLUG = /^[a-z0-9-]{1,40}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUSES: readonly string[] = ["empty", "draft", "review", "stable"];
const ORIGINS: readonly string[] = ["template", "user", "agent"];
const MAX_CONTRIBUTORS = 200;

export interface IdeaIndexPayload {
  readonly pages: readonly {
    readonly slug: string;
    readonly title: string;
    readonly position: number;
    readonly required: boolean;
    readonly origin: IdeaPageFileOrigin;
  }[];
  readonly contributorUserIds: readonly string[];
}

export const isIdeaSlug = (value: unknown): value is string =>
  typeof value === "string" && SLUG.test(value);

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) &&
  value.length <= MAX_CONTRIBUTORS &&
  value.every((v) => typeof v === "string");

/** `idea.page.write` : la page à écrire. */
export function ideaPagePayload(payload: Record<string, unknown>): IdeaPageFile | undefined {
  const { slug, title, status, required, origin, contentMd } = payload;
  const { mis_a_jour: updatedAt, contributeurs } = payload;
  if (!isIdeaSlug(slug) || typeof title !== "string" || typeof contentMd !== "string")
    return undefined;
  if (typeof status !== "string" || !STATUSES.includes(status)) return undefined;
  if (typeof origin !== "string" || !ORIGINS.includes(origin)) return undefined;
  if (typeof required !== "boolean" || typeof updatedAt !== "string") return undefined;
  if (!isStringArray(contributeurs)) return undefined;
  return {
    slug,
    title,
    status: status as IdeaPageFileStatus,
    required,
    origin: origin as IdeaPageFileOrigin,
    updatedAt,
    contributors: contributeurs,
    contentMd,
  };
}

/** `idea.page.delete` : le slug de la page à retirer. */
export const ideaDeleteSlug = (payload: Record<string, unknown>): string | undefined =>
  isIdeaSlug(payload.slug) ? payload.slug : undefined;

function indexPage(value: unknown): IdeaIndexPayload["pages"][number] | undefined {
  if (!isRecord(value)) return undefined;
  const { slug, title, position, required, origin, status } = value;
  if (!isIdeaSlug(slug) || typeof title !== "string") return undefined;
  if (typeof position !== "number" || !Number.isInteger(position) || position < 0) return undefined;
  if (typeof required !== "boolean") return undefined;
  if (typeof origin !== "string" || !ORIGINS.includes(origin)) return undefined;
  if (typeof status !== "string" || !STATUSES.includes(status)) return undefined;
  return { slug, title, position, required, origin: origin as IdeaPageFileOrigin };
}

/** `idea.index.write` : structure, ordre des pages, identifiants des contributeurs (jamais d'e-mail). */
export function ideaIndexPayload(payload: Record<string, unknown>): IdeaIndexPayload | undefined {
  const { pages, contributorUserIds } = payload;
  if (!Array.isArray(pages) || pages.length > 200) return undefined;
  if (!isStringArray(contributorUserIds) || !contributorUserIds.every((id) => UUID.test(id))) {
    return undefined;
  }
  const parsed = pages.map(indexPage);
  if (parsed.some((page) => page === undefined)) return undefined;
  return { pages: parsed as IdeaIndexPayload["pages"], contributorUserIds };
}

/** Identifiants de contributeurs d'un lot, sans doublon, dans l'ordre de l'index. */
export function contributorIdsOf(
  operations: readonly { kind: string; payload: Record<string, unknown> }[],
): string[] {
  const ids = operations
    .filter((operation) => operation.kind === "idea.index.write")
    .flatMap((operation) => ideaIndexPayload(operation.payload)?.contributorUserIds ?? []);
  return [...new Set(ids)];
}

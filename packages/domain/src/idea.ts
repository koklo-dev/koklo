/**
 * Espace Idée (TK-89) : règles pures du dossier de pages, partagées par l'API. Aucune I/O.
 * Le slug miroite `slugOf` du worker (repli `page`), il n'est jamais modifié après création.
 */

export const IDEA_PAGE_LIMIT = 50;
export const IDEA_TRASH_DAYS = 30;
export const IDEA_CONTENT_MAX = 50_000;
export const IDEA_TITLE_MAX = 120;
export const IDEA_SLUG_MAX = 40;
/** Présence : une ligne vue depuis moins de 45 s compte comme active (décision 5). */
export const IDEA_PRESENCE_TTL_MS = 45_000;

export type IdeaPageStatus = "empty" | "draft" | "review" | "stable";

/** Entrée refusée (titre, contenu) : devient `VALIDATION` côté API. */
export class InvalidIdeaError extends Error {
  readonly field: string;
  constructor(field: string, message: string) {
    super(message);
    this.name = "InvalidIdeaError";
    this.field = field;
  }
}

export function ideaSlugOf(title: string): string {
  const slug = title
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .slice(0, IDEA_SLUG_MAX)
    .replace(/-+$/, "");
  return slug === "" ? "page" : slug;
}

/** Premier slug libre : le slug seul, puis `-2`, `-3`… (la base est coupée pour tenir en 40). */
export function uniqueIdeaSlug(base: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  if (!used.has(base)) return base;
  for (let n = 2; ; n += 1) {
    const suffix = `-${n}`;
    const candidate = `${base.slice(0, IDEA_SLUG_MAX - suffix.length).replace(/-+$/, "")}${suffix}`;
    if (!used.has(candidate)) return candidate;
  }
}

const isControl = (code: number): boolean => code < 0x20 || code === 0x7f;

/** Substitut UTF-16 isolé : PostgreSQL refuserait l'écriture. */
function hasLoneSurrogate(text: string): boolean {
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = text.charCodeAt(i + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true;
      i += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return true;
    }
  }
  return false;
}

/** Titre : une ligne, sans caractère de contrôle, rogné, 1 à 120 caractères. */
export function normalizeIdeaTitle(raw: string): string {
  const title = raw.trim();
  if (title === "" || title.length > IDEA_TITLE_MAX) {
    throw new InvalidIdeaError("title", `Le titre compte 1 à ${IDEA_TITLE_MAX} caractères.`);
  }
  if (hasLoneSurrogate(title) || [...title].some((char) => isControl(char.charCodeAt(0)))) {
    throw new InvalidIdeaError("title", "Le titre tient sur une seule ligne, sans contrôle.");
  }
  return title;
}

/** Contenu Markdown : 50 000 caractères au plus, ni NUL ni substitut isolé. */
export function normalizeIdeaContent(raw: string): string {
  if (raw.length > IDEA_CONTENT_MAX) {
    throw new InvalidIdeaError("contentMd", `Le contenu dépasse ${IDEA_CONTENT_MAX} caractères.`);
  }
  if (raw.includes("\u0000") || hasLoneSurrogate(raw)) {
    throw new InvalidIdeaError("contentMd", "Le contenu contient un caractère interdit.");
  }
  return raw;
}

/** Contenu vide : page vide ; texte sur une page vide : brouillon ; sinon le statut courant reste. */
export function ideaPageStatusAfterSave(
  current: IdeaPageStatus,
  contentMd: string,
): IdeaPageStatus {
  if (contentMd.trim() === "") return "empty";
  return current === "empty" ? "draft" : current;
}

export function isIdeaRestorable(deletedAt: Date, now: Date): boolean {
  return now.getTime() - deletedAt.getTime() <= IDEA_TRASH_DAYS * 86_400_000;
}

/** `requested` est exactement l'ensemble des pages actives, une fois chacune. */
export function isIdeaReorderComplete(
  activeIds: readonly string[],
  requested: readonly string[],
): boolean {
  if (requested.length !== activeIds.length) return false;
  const active = new Set(activeIds);
  const seen = new Set(requested);
  return seen.size === requested.length && requested.every((id) => active.has(id));
}

export function isIdeaPresenceActive(seenAt: Date, now: Date): boolean {
  return now.getTime() - seenAt.getTime() < IDEA_PRESENCE_TTL_MS;
}

/**
 * Versions figées de l'idée (TK-91). Le slug `_synthese` est réservé à la Synthèse (`idea/_synthese.md`) : un slug de
 * page ne contient jamais `_` (`ideaSlugOf`), donc aucune page ne peut le porter.
 */
export const IDEA_SYNTHESIS_SLUG = "_synthese";
export const IDEA_VERSION_MAX = 9999;
/** Étiquette construite par le serveur, jamais saisie : le worker la revalide avant de poser le tag. */
export const IDEA_VERSION_TAG_PATTERN = /^idea-v[1-9][0-9]{0,3}$/;

export function ideaVersionTag(number: number): string {
  if (!Number.isInteger(number) || number < 1 || number > IDEA_VERSION_MAX) {
    throw new InvalidIdeaError("number", `Le numéro de version va de 1 à ${IDEA_VERSION_MAX}.`);
  }
  return `idea-v${number}`;
}

export const isIdeaVersionTag = (value: unknown): value is string =>
  typeof value === "string" && IDEA_VERSION_TAG_PATTERN.test(value);

export interface FramingPage {
  readonly title: string;
  readonly required: boolean;
  readonly status: IdeaPageStatus;
}

export interface FramingReadiness {
  readonly ready: boolean;
  /** Pages stables parmi les pages actives, et pages actives (la Synthèse n'est pas une page). */
  readonly stable: number;
  readonly total: number;
  /** Titres courants des pages requises pas encore stables, dans l'ordre du dossier. */
  readonly missing: readonly string[];
}

/** Seuil du passage au cadrage : toutes les pages requises (drapeau `required`, donc fidèle au renommage) sont stables. */
export function framingReadiness(pages: readonly FramingPage[]): FramingReadiness {
  const missing = pages
    .filter((page) => page.required && page.status !== "stable")
    .map((page) => page.title);
  return {
    ready: missing.length === 0,
    stable: pages.filter((page) => page.status === "stable").length,
    total: pages.length,
    missing,
  };
}

/** « Périmètre stable », « Utilisateurs et Périmètre stables » : la raison dite à côté du bouton désactivé. */
export function framingMissingLabel(missing: readonly string[]): string {
  const last = missing.at(-1) ?? "";
  if (missing.length <= 1) return `${last} stable`;
  return `${missing.slice(0, -1).join(", ")} et ${last} stables`;
}

const OPEN_TASK = /^[ \t]*[-*+][ \t]+\[ \](?:[ \t]|$)/;
const FENCE = /^[ \t]*(?:```|~~~)/;

/** Questions ouvertes d'une page : ses tâches Markdown non cochées (`- [ ]`), hors blocs de code. */
export function countOpenQuestions(contentMd: string): number {
  let inCode = false;
  let count = 0;
  for (const line of contentMd.split("\n")) {
    if (FENCE.test(line)) inCode = !inCode;
    else if (!inCode && OPEN_TASK.test(line)) count += 1;
  }
  return count;
}

/** Vrai si une page s'ajoute, disparaît ou change de version depuis l'empreinte figée (version de contenu par slug). */
export function ideaModifiedSince(
  frozen: Readonly<Record<string, number>>,
  current: Readonly<Record<string, number>>,
): boolean {
  const slugs = new Set([...Object.keys(frozen), ...Object.keys(current)]);
  return [...slugs].some((slug) => frozen[slug] !== current[slug]);
}

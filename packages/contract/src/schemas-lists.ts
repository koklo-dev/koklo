import { z } from "zod";

/**
 * Listes longues (TK-94, contrat 1.0.0, passation 07 §3). Deux schémas : le curseur pour les listes
 * qu'on parcourt (`ListInput` / `ListOutput`) et le décalage pour les tableaux qu'on compare
 * (`PageInput` / `PageOutput`). Les filtres sont des champs typés de chaque route, pas un objet libre.
 */

/** Taille de page maximale d'une liste à curseur. Le défaut (50) est celui du serveur. */
export const LIST_MAX_LIMIT = 100;
export const LIST_QUERY_MAX_LENGTH = 200;

/** Tailles de page d'un tableau (schéma 1.2). */
export const PAGE_SIZES = [25, 50, 100] as const;

/**
 * Champs de recherche et de position communs aux listes à curseur. `limit` arrive en chaîne dans une
 * requête GET, d'où la coercition. `around` est l'identifiant de l'élément à amener dans la page
 * (lien direct) ; son format est celui de la liste (`F-nnn`, `TK-n`).
 */
export const listInputShape = <A extends z.ZodType<string>>(around: A) => ({
  q: z.string().min(1).max(LIST_QUERY_MAX_LENGTH).optional(),
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(LIST_MAX_LIMIT).optional(),
  around: around.optional(),
});

/** `around` désigne une page entière : il exclut un curseur, qui en désigne une autre. */
export const AROUND_WITH_CURSOR_MESSAGE = "around et cursor s'excluent";
export const noAroundWithCursor = (input: { around?: string; cursor?: string }): boolean =>
  input.around === undefined || input.cursor === undefined;

export const listInputSchema = z
  .object(listInputShape(z.string().min(1)))
  .refine(noAroundWithCursor, AROUND_WITH_CURSOR_MESSAGE);

/** Compte par valeur de chaque dimension filtrable : `{ status: { todo: 142, done: 30 } }`. */
export const facetsSchema = z.record(z.string(), z.record(z.string(), z.number().int().min(0)));

/**
 * Page d'une liste à curseur. `total` est le nombre réel d'éléments de la liste filtrée ; `offset` le
 * rang (0 pour le premier) du premier élément de la page dans cette liste ; `previousCursor` charge
 * la page d'avant (`null` en tête). `facets` compte chaque dimension sans tenir compte de son propre
 * filtre, pour que les compteurs d'une barre de filtres restent justes.
 */
export const listOf = <T extends z.ZodType>(item: T) =>
  z.object({
    items: z.array(item),
    nextCursor: z.string().nullable(),
    previousCursor: z.string().nullable(),
    offset: z.number().int().min(0),
    total: z.number().int().min(0),
    facets: facetsSchema.optional(),
  });

export const pageNumberInputSchema = z.object({
  q: z.string().min(1).max(LIST_QUERY_MAX_LENGTH).optional(),
  page: z.coerce.number().int().min(1),
  size: z.coerce
    .number()
    .pipe(z.union([z.literal(PAGE_SIZES[0]), z.literal(PAGE_SIZES[1]), z.literal(PAGE_SIZES[2])])),
});

/** Page d'un tableau : au-delà de 10 000 lignes le total devient une estimation. */
export const pageNumberOf = <T extends z.ZodType>(item: T) =>
  z.object({
    items: z.array(item),
    total: z.number().int().min(0),
    totalIsEstimate: z.boolean(),
  });

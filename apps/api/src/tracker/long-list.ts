import { notFound, validation } from "./api-errors.ts";
import { isUuid } from "./uuid.ts";

/**
 * Moteur des listes longues (TK-94, contrat 1.0.0). Une liste est triée par `(clé, id)` ; une page
 * est lue à partir d'une position (curseur) dans un sens, ou à partir d'un rang (`around`). Le
 * moteur ne connaît ni Prisma ni les filtres : chaque liste fournit une `ListSource`.
 */
export type Direction = "after" | "before";

/** Position d'une ligne dans le tri : sa clé de tri et son identifiant (départage stable). */
export interface Position<K> {
  key: K;
  id: string;
}

export interface ListRequest {
  limit: number;
  cursor?: string;
  around?: string;
}

/** Ce que le moteur demande à une liste ; tout est déjà borné au périmètre et aux filtres actifs. */
export interface ListSource<R, K> {
  /** Nombre de lignes de la liste filtrée. */
  total(): Promise<number>;
  /**
   * `take` lignes après avoir sauté `skip` lignes, en partant de `from` (exclu) ou du début de la
   * liste si `from` est `null`. `before` rend les lignes en remontant, la plus proche d'abord.
   */
  page(direction: Direction, from: Position<K> | null, take: number, skip: number): Promise<R[]>;
  /** Nombre de lignes de la liste filtrée strictement avant `position`. */
  countBefore(position: Position<K>): Promise<number>;
  /** Ligne désignée par `around` dans le périmètre ; `listed` : elle passe aussi les filtres. */
  locate(around: string): Promise<{ position: Position<K>; listed: boolean } | null>;
  positionOf(row: R): Position<K>;
  /** Clé de tri <-> JSON du curseur ; `decode` rend `null` pour une valeur étrangère. */
  encodeKey(key: K): string | number;
  decodeKey(raw: unknown): K | null;
}

export interface ListWindow<R> {
  rows: R[];
  /** Rang (0 pour la première) de la première ligne dans la liste filtrée. */
  offset: number;
  total: number;
  nextCursor: string | null;
  previousCursor: string | null;
}

const CODES = { a: "after", b: "before" } as const;

const encodeCursor = <R, K>(source: ListSource<R, K>, direction: Direction, row: R): string => {
  const { key, id } = source.positionOf(row);
  const code = direction === "after" ? "a" : "b";
  return Buffer.from(JSON.stringify([code, source.encodeKey(key), id])).toString("base64url");
};

const invalidCursor = () => validation("cursor", "Curseur invalide");

/** Curseur émis par nous pour cette liste ; `VALIDATION{cursor}` pour tout le reste. */
function decodeCursor<R, K>(source: ListSource<R, K>, cursor: string) {
  try {
    const [code, raw, id] = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    const key = source.decodeKey(raw);
    if (!(code in CODES) || key === null || typeof id !== "string" || !isUuid(id)) {
      throw invalidCursor();
    }
    return { direction: CODES[code as keyof typeof CODES], position: { key, id } };
  } catch {
    throw invalidCursor();
  }
}

interface Plan<K> {
  direction: Direction;
  from: Position<K> | null;
  skip: number;
}

/** Où commencer : après un curseur, sur la page de `around` (alignée sur `limit`), ou au début. */
async function planOf<R, K>(source: ListSource<R, K>, request: ListRequest): Promise<Plan<K>> {
  if (request.cursor !== undefined) {
    const { direction, position } = decodeCursor(source, request.cursor);
    return { direction, from: position, skip: 0 };
  }
  if (request.around !== undefined) {
    const found = await source.locate(request.around);
    if (!found) throw notFound();
    if (found.listed) {
      const rank = await source.countBefore(found.position);
      return { direction: "after", from: null, skip: rank - (rank % request.limit) };
    }
  }
  return { direction: "after", from: null, skip: 0 };
}

/**
 * Une page de la liste, avec son rang, le total et les curseurs des deux côtés. `around` désigne une
 * ligne absente des filtres actifs : la première page est rendue, sans erreur, et l'appelant voit que
 * la ligne n'y figure pas. Le total et le rang sont exacts au moment de la lecture.
 */
export async function loadWindow<R, K>(
  source: ListSource<R, K>,
  request: ListRequest,
): Promise<ListWindow<R>> {
  const plan = await planOf(source, request);
  // Une transaction n'a qu'une connexion : les lectures se font l'une après l'autre.
  const fetched = await source.page(plan.direction, plan.from, request.limit, plan.skip);
  const total = await source.total();
  const rows = plan.direction === "before" ? [...fetched].reverse() : fetched;
  const first = rows[0];
  const last = rows.at(-1);
  if (first === undefined || last === undefined) {
    return {
      rows,
      offset: plan.from === null ? 0 : total,
      total,
      nextCursor: null,
      previousCursor: null,
    };
  }
  const offset =
    plan.from === null ? plan.skip : await source.countBefore(source.positionOf(first));
  return {
    rows,
    offset,
    total,
    nextCursor: offset + rows.length < total ? encodeCursor(source, "after", last) : null,
    previousCursor: offset > 0 ? encodeCursor(source, "before", first) : null,
  };
}

/** Compte par valeur d'une dimension, à partir d'un `groupBy` Prisma (valeurs absentes omises). */
export function countsOf<V extends string>(
  groups: readonly { _count: { _all: number }; [dimension: string]: unknown }[],
  dimension: string,
): Record<V, number> {
  return Object.fromEntries(
    groups.map((group) => [String(group[dimension]), group._count._all]),
  ) as Record<V, number>;
}

/** Filtre « strictement après / avant » `(champ, id)` ; la clé est une date ou un entier. */
export function keysetBy<F extends string, K extends Date | number>(
  field: F,
  position: Position<K>,
  op: "gt" | "lt",
) {
  return {
    OR: [{ [field]: { [op]: position.key } }, { [field]: position.key, id: { [op]: position.id } }],
  };
}

/** Nouvel ordre après avoir déplacé `id` d'un cran ; `null` si la page est déjà au bord. */
export function arrayMoveIds(ids: string[], id: string, direction: -1 | 1): string[] | null {
  const from = ids.indexOf(id);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= ids.length) return null;
  const next = [...ids];
  next.splice(from, 1);
  next.splice(to, 0, id);
  return next;
}

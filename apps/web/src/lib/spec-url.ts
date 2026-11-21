/**
 * Écriture commune des adresses des écrans de la spec (Données, Architecture) : un paramètre se pose, se retire quand
 * la valeur est vide ou `null`, et reste intact quand elle est `undefined`.
 */
export const setOrDelete = (
  params: URLSearchParams,
  name: string,
  value: string | null | undefined,
): void => {
  if (value === undefined) return;
  if (value === null || value === "") params.delete(name);
  else params.set(name, value);
};

/** `review: true` écrit `view=review` (et l'onglet Relecture sauf onglet demandé) ; `null` ou `false` les retire. */
export function applyReview(
  params: URLSearchParams,
  patch: { review?: boolean | null | undefined; tab?: string | null | undefined },
): void {
  if (patch.review === undefined) return;
  if (patch.review === true) {
    params.set("view", "review");
    if (patch.tab === undefined) params.set("tab", "review");
    return;
  }
  params.delete("view");
  if (params.get("tab") === "review") params.delete("tab");
}

export const nonEmpty = (value: string | null): string | undefined => value?.trim() || undefined;

import type { SpecItem } from "@koklo/contract";

/** Fiche d'une fonctionnalité : `spec.item.get` rend aussi (3.1.0) les fiches de règle, de rôle et de parcours. */
export type FeatureItem = Extract<SpecItem, { type: "feature" }>;

/** Réduit une fiche à celle d'une fonctionnalité (le type demandé est `feature`) ; toute autre est un défaut du serveur. */
export function asFeatureItem(item: SpecItem): FeatureItem {
  if (item.type !== "feature")
    throw new Error("Fiche inattendue : une fonctionnalité était attendue.");
  return item;
}

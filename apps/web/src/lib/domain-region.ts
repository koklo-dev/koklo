import { formatCount } from "@koklo/ui";
import type { DomainTab } from "./use-domain-data.ts";

export interface DomainNoun {
  one: string;
  other: string;
  /** Féminin : « règles chargées » ; masculin : « parcours chargés ». */
  masculine?: boolean;
}

/** Nom de ce que liste chaque onglet, au singulier et au pluriel, avec l'article du texte de chargement. */
export const DOMAIN_NOUNS: Record<DomainTab, DomainNoun & { loading: string; none: string }> = {
  rules: { one: "règle", other: "règles", loading: "des règles métier", none: "Aucune règle" },
  roles: {
    one: "action",
    other: "actions",
    loading: "des rôles et permissions",
    none: "Aucune action",
  },
  flows: {
    one: "parcours",
    other: "parcours",
    masculine: true,
    loading: "des parcours",
    none: "Aucun parcours",
  },
};

const found = (count: number, noun: DomainNoun): string => {
  const word = count > 1 ? noun.other : noun.one;
  const done = noun.masculine ? "trouvé" : "trouvée";
  return `${formatCount(count)} ${word} ${count > 1 ? `${done}s` : done}`;
};

/** Annonce d'un résultat de recherche ou de filtre : « 12 règles trouvées sur 300 », « Aucun résultat pour « x » ». */
export function domainResultText(options: {
  q: string | undefined;
  filtered: boolean;
  total: number;
  projectTotal: number | undefined;
  noun: DomainNoun & { none: string };
}): string {
  const { q, filtered, total, projectTotal, noun } = options;
  if (total === 0)
    return q ? `Aucun résultat pour « ${q} »` : `${noun.none} ne correspond à ce filtre.`;
  if (!q && !filtered) return "";
  const text = found(total, noun);
  return projectTotal === undefined ? text : `${text} sur ${formatCount(projectTotal)}`;
}

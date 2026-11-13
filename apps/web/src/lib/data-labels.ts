import { formatCount } from "@koklo/ui";

/** Libellés de l'écran Données (maquette 11) : un seul endroit, aucune phrase dans les composants de liste. */
export const DATA_NOUN = { one: "table", other: "tables", masculine: false } as const;
export const DATA_TABLES_LABEL = "Rechercher une table ou un champ";
export const DATA_PERSONAL_NOTE =
  "Les champs marqués « données personnelles » sont reliés à l'exigence NFR-001 (RGPD) du cahier technique.";
export const DATA_FIXTURES_HELP =
  "Données fictives, typées d'après les tables. Elles alimentent les maquettes d'écrans (lot Design) et les tests.";
export const DATA_LOCKED_TITLE = "Cette page est réservée à l'équipe";
export const DATA_LOCKED_TEXT =
  "Le modèle de données est tenu par l'équipe du projet. Le cahier fonctionnel reste ouvert à votre lecture.";

const plural = (count: number, one: string, other: string): string =>
  `${formatCount(count)} ${count >= 2 ? other : one}`;

/** Annonce d'un résultat de recherche ou de filtre : « 12 tables trouvées sur 80 », « Aucune table ne correspond à « x » ». */
export function tablesResultText(options: {
  q: string | undefined;
  zone: string | undefined;
  total: number;
  projectTotal: number | undefined;
}): string {
  const { q, zone, total, projectTotal } = options;
  if (total === 0) {
    return q ? `Aucune table ne correspond à « ${q} »` : "Aucune table dans cette zone.";
  }
  if (!q && !zone) return "";
  const found = `${plural(total, "table trouvée", "tables trouvées")}`;
  return projectTotal === undefined ? found : `${found} sur ${formatCount(projectTotal)}`;
}

/** Pied du tableau des tables : « Les 50 suivantes se chargent… » ou « Fin de la liste · 65 tables » (maquette 11 l.422). */
export function tablesFooterText(loaded: number, total: number): string {
  return loaded < total
    ? `Les ${Math.min(50, total - loaded)} suivantes se chargent automatiquement en approchant du bas.`
    : `Fin de la liste · ${plural(total, "table", "tables")}`;
}

/** « 3 lignes · T-client · locale fr-FR » (maquette 11 l.560). */
export function fixtureMeta(rowCount: number, table: string, locale: string): string {
  return `${plural(rowCount, "ligne", "lignes")} · ${table} · locale ${locale}`;
}

/** Identifiants du « Utilisée par » : F-001, R-004. */
export const usedByText = (ids: readonly string[]): string =>
  ids.length > 0 ? ids.join(", ") : "—";

/** Nom accessible du tableau : « Tables du modèle de données ». */
export const TABLES_TABLE_LABEL = "Tables du modèle de données";

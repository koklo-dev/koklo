import { pad, pick } from "./seed-volume-sql.ts";
import type { VolumeProfile } from "./seed-volumes.ts";

/**
 * Tables et jeux d'exemple des jeux de volume (TK-107, TK-110). `large` : huit zones tournantes, chaque table reliée à la
 * précédente. `planche` : les six zones de la planche « Volume réel » (6, 9, 18, 7, 14 et 11 tables, dans l'ordre de la
 * maquette), une chaîne de relations à l'intérieur de chaque zone et les liens entre zones de la maquette (17 depuis les
 * rendez-vous). Tout est déterministe : aucune horloge, aucun aléa.
 */
const LARGE_ZONES = [
  "Clients",
  "Rendez-vous",
  "Paiements",
  "Comptes",
  "Documents",
  "Notifications",
  "Équipes",
  "Paramètres",
] as const;

/** Zones de la maquette (ZN), dans l'ordre, avec leur nombre de tables. */
const PLANCHE_ZONES = [
  { name: "Prise de rendez-vous", size: 6 },
  { name: "Clients et fidélité", size: 9 },
  { name: "Catalogue et stock", size: 18 },
  { name: "Personnel", size: 7 },
  { name: "Paiement et caisse", size: 14 },
  { name: "Communication", size: 11 },
] as const;

/** Liens de la maquette (ZL) : indices dans `PLANCHE_ZONES`, nombre de paires de tables reliées. */
const PLANCHE_LINKS = [
  [0, 1, 4],
  [0, 2, 3],
  [0, 3, 2],
  [0, 4, 5],
  [0, 5, 3],
  [1, 5, 6],
  [4, 1, 4],
  [2, 4, 7],
  [3, 2, 2],
] as const;

/** Rang (à partir de 1) de la première table de chaque zone de la planche. */
const STARTS = PLANCHE_ZONES.map((_, index) =>
  PLANCHE_ZONES.slice(0, index).reduce((sum, zone) => sum + zone.size, 1),
);

/** Relations entre zones : une paire de tables par lien, `(i mod taille)` de chaque côté (paires distinctes tant que i < ppcm). */
const crossPairs = (): [number, number][] =>
  PLANCHE_LINKS.flatMap(([from, to, count]) =>
    Array.from({ length: count }, (_, i): [number, number] => [
      (STARTS[from] as number) + (i % (PLANCHE_ZONES[from]?.size ?? 1)),
      (STARTS[to] as number) + (i % (PLANCHE_ZONES[to]?.size ?? 1)),
    ]),
  );

const zoneSql = (profile: VolumeProfile): string => {
  if (profile === "large") return pick(LARGE_ZONES, "n % 8");
  const branches = PLANCHE_ZONES.map((zone, index) => {
    const end = (STARTS[index] as number) + zone.size - 1;
    return `WHEN n <= ${end} THEN '${zone.name}'`;
  });
  return `(CASE ${branches.join(" ")} END)`;
};

/** Vrai pour une table reliée à la précédente (`large` : toutes sauf la première ; `planche` : dans sa zone seulement). */
const chainedSql = (profile: VolumeProfile): string =>
  profile === "large" ? "n > 1" : `n NOT IN (${STARTS.join(", ")})`;

/** Relations `1 → n` vers les tables d'autres zones, portées par la table du côté « un » (aucune sur `large`). */
const crossRelationsSql = (profile: VolumeProfile): string => {
  if (profile === "large") return "'[]'::jsonb";
  const values = crossPairs()
    .map(([from, to]) => `(${from}, ${to})`)
    .join(", ");
  return `COALESCE((SELECT jsonb_agg(jsonb_build_object('vers', 'T-table-' || ${pad("link.target")}, 'cardinalite', '1 → n'))
      FROM (VALUES ${values}) AS link(source, target) WHERE link.source = n), '[]'::jsonb)`;
};

/**
 * Contenu d'une table au format v2 (TK-107, B385) : `titre` = nom, zone, champs (clé primaire, nom, horodatage, référence vers
 * la table précédente de la zone, e-mail personnel une fois sur quatre), une relation `n → 1` vers la précédente, les liens
 * entre zones et une fonctionnalité en `source`. Les identifiants cités existent tous dans le jeu.
 */
export const tableData = (profile: VolumeProfile, features: number): string => {
  const previous = pad("(n - 1)");
  const chained = chainedSql(profile);
  const field = (name: string, type: string, extra = "") =>
    `jsonb_build_object('nom', '${name}', 'type', ${type}${extra})`;
  return `jsonb_build_object(
    'id', 'T-table-' || ${pad()}, 'titre', 'Table ' || ${pad()}, 'nom', 'Table ' || ${pad()},
    'description', 'Table de volume ' || ${pad()}, 'zone', ${zoneSql(profile)},
    'source', jsonb_build_array('F-' || ${pad(`(1 + n % ${features})`)}),
    'champs', jsonb_build_array(
        ${field("id", "'uuid'", ", 'cle', 'primaire'")},
        ${field("nom", "'texte(120)'", ", 'contraintes', 'Obligatoire'")},
        ${field("cree_le", "'horodatage'")})
      || CASE WHEN ${chained} THEN jsonb_build_array(${field("parent_id", `'ref(T-table-' || ${previous} || ')'`)}) ELSE '[]'::jsonb END
      || CASE WHEN n % 4 = 0 THEN jsonb_build_array(${field("email", "'texte(255)'", ", 'donnees_personnelles', true")}) ELSE '[]'::jsonb END,
    'relations', CASE WHEN ${chained}
      THEN jsonb_build_array(jsonb_build_object('vers', 'T-table-' || ${previous}, 'cardinalite', 'n → 1'))
      ELSE '[]'::jsonb END || ${crossRelationsSql(profile)})`;
};

/** Lignes générées du premier jeu (B488) : 1 240 sur la planche, 5 000 sur `large`, graine égale au total. */
const GENERATED_ROWS: Record<VolumeProfile, number> = { large: 5000, planche: 1240 };

/**
 * Contenu d'un jeu d'exemple : trois lignes fictives sur le champ `nom` de la table du même rang ; le premier jeu porte en plus
 * un bloc `generation` (noms fictifs et dates) qui prolonge ces lignes jusqu'au total.
 */
export const fixtureData = (profile: VolumeProfile): string => {
  const total = GENERATED_ROWS[profile];
  return `jsonb_build_object('id', 'FX-table-' || ${pad()}, 'titre', 'Jeu d''exemple ' || ${pad()},
    'table', 'T-table-' || ${pad()}, 'locale', 'fr-FR',
    'lignes', jsonb_build_array(
      jsonb_build_object('nom', 'Léa Martin'), jsonb_build_object('nom', 'Karim Haddad'),
      jsonb_build_object('nom', 'Sophie Dubois')))
    || CASE WHEN n = 1 THEN jsonb_build_object('generation', jsonb_build_object('graine', ${total}, 'total', ${total},
      'regles', jsonb_build_object('nom', jsonb_build_object('type', 'nom'),
        'cree_le', jsonb_build_object('type', 'date', 'debut', '2026-01-01', 'jours', 364))))
      ELSE '{}'::jsonb END`;
};

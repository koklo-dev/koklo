import { pad, pick } from "./seed-volume-sql.ts";
import type { VolumeProfile } from "./seed-volumes.ts";

/**
 * Décisions d'architecture des jeux de volume (TK-113, B575 à B592), au format d'index du worker (`architecture/adr/ADR-<nnn>-<slug>.md`).
 * `planche` : 23 décisions, dont la quatrième est remplacée par la dix-huitième, les trois dernières sont proposées et les
 * dix-neuf autres acceptées. `large` : 300, une sur vingt remplacée par la suivante, une sur dix proposée. Dates croissantes avec le
 * rang (une remplaçante est donc toujours postérieure), liens vers un composant et une fonctionnalité du jeu. Aucune horloge, aucun aléa.
 */
const DECIDERS = ["Équipe technique", "Cheffe de projet"] as const;

/** Rang de la décision remplacée et de sa remplaçante : `planche` une fois, `large` une fois sur vingt. */
const replacedSql = (profile: VolumeProfile): string =>
  profile === "large" ? "n % 20 = 4" : "n = 4";
const replacedBySql = (profile: VolumeProfile): string =>
  profile === "large" ? pad("(n + 1)") : pad("18");
const proposedSql = (profile: VolumeProfile, count: number): string =>
  profile === "large" ? "n % 10 = 0" : `n > ${count - 3}`;

export const adrData = (
  profile: VolumeProfile,
  count: number,
  components: number,
  features: number,
): string => `jsonb_strip_nulls(jsonb_build_object(
    'id', 'ADR-' || ${pad()}, 'titre', 'Décision d''architecture ' || ${pad()},
    'statut', CASE WHEN ${replacedSql(profile)} THEN 'remplacee' WHEN ${proposedSql(profile, count)} THEN 'proposee' ELSE 'acceptee' END,
    'remplacee_par', CASE WHEN ${replacedSql(profile)} THEN 'ADR-' || ${replacedBySql(profile)} END,
    'date', to_char(DATE '2026-01-01' + n, 'YYYY-MM-DD'),
    'decideurs', jsonb_build_array(${pick(DECIDERS, "n % 2")}),
    'liens', jsonb_build_array('C-composant-' || ${pad(`(1 + n % ${components})`)}, 'F-' || ${pad(`(1 + n % ${features})`)}),
    'contexte', 'Contexte de la décision ' || ${pad()} || ' : le besoin et les contraintes de l''équipe.',
    'decision', 'Décision retenue ' || ${pad()} || '.',
    'consequences', jsonb_build_object(
      'positives', jsonb_build_array('Le comportement est plus simple à comprendre.'),
      'a_accepter', jsonb_build_array('Un surcoût de maintenance à surveiller.')),
    'alternatives', jsonb_build_array(jsonb_build_object('nom', 'Autre option', 'raison', 'Moins adaptée au besoin.')),
    'en_clair', 'En clair : ce choix rend le produit plus fiable pour les utilisateurs.'))`;

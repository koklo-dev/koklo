import pg from "pg";
import { SEED_DATE, SEED_IDS } from "./seed-data.ts";
import { assertSeedAllowed } from "./seed-guard.ts";
import { organizationStatements, upsert } from "./seed-statements.ts";
import { buildVolumeStatements, type VolumeTarget } from "./seed-volume-statements.ts";
import { SEED_VOLUMES, type SeededVolume, type VolumeProfile } from "./seed-volumes.ts";

export type { VolumeTarget } from "./seed-volume-statements.ts";
export type { VolumeProfile } from "./seed-volumes.ts";

/** Projets de volume de l'organisation de démo : identifiants fixes, deux projets distincts. */
export const SEED_VOLUME_IDS: Record<VolumeProfile, { project: string; name: string }> = {
  large: { project: "01900000-0000-7000-8000-0000000000b1", name: "Volume · charge" },
  planche: { project: "01900000-0000-7000-8000-0000000000b2", name: "Volume · planche" },
};

export interface VolumeOptions {
  /** Environnement évalué par le garde-fou ; `process.env` par défaut. */
  env?: { NODE_ENV?: string };
  /**
   * Projet existant à remplir (tests d'intégration : le projet d'un monde de test). Sans cible, le
   * projet de volume fixe est créé dans l'organisation de démo.
   */
  target?: VolumeTarget;
}

const DEMO_ORGANIZATION = SEED_IDS.organization;

/** Le projet de volume : créé (ou renommé) s'il est fixe, laissé tel quel s'il appartient à l'appelant. */
function projectStatement(profile: VolumeProfile, options: VolumeOptions) {
  if (options.target) {
    return {
      sql: `INSERT INTO projects (id, organization_id, name, created_at, updated_at)
            VALUES ($1, $2, 'Projet de volume', $3, $3) ON CONFLICT (id) DO NOTHING`,
      params: [options.target.projectId, options.target.organizationId, SEED_DATE],
    };
  }
  const { project, name } = SEED_VOLUME_IDS[profile];
  return upsert("projects", "id", { id: project, organization_id: DEMO_ORGANIZATION, name });
}

/**
 * Charge un jeu de volume (B19) : `large` pour les listes longues, `planche` pour la planche
 * « Volume réel ». Idempotent (upserts à identifiants dérivés), une seule transaction, refuse de
 * s'exécuter en production avant toute connexion. Ne touche ni le projet de démo ni l'autre profil.
 * Insère uniquement ce que le schéma sait porter ; les volumes des modèles à venir sont déclarés dans
 * `seed-volumes.ts`.
 */
export async function seedVolume(
  databaseUrl: string,
  profile: VolumeProfile,
  options: VolumeOptions = {},
): Promise<SeededVolume> {
  assertSeedAllowed(options.env ?? process.env);
  const target = options.target ?? {
    organizationId: DEMO_ORGANIZATION,
    projectId: SEED_VOLUME_IDS[profile].project,
  };
  const statements = [
    ...(options.target ? [] : organizationStatements()),
    projectStatement(profile, options),
    ...buildVolumeStatements(profile, target),
  ];
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query("BEGIN");
    for (const { sql, params } of statements) {
      await client.query(sql, params);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
  return SEED_VOLUMES[profile];
}

/** `pnpm seed:large` : 1 000 fonctionnalités, 80 tables, 500 tickets. */
export const seedLarge = (databaseUrl: string, options?: VolumeOptions) =>
  seedVolume(databaseUrl, "large", options);

/** `pnpm seed:planche` : 248 fonctionnalités, 65 tables, 47 points d'accès, 60 tickets. */
export const seedPlanche = (databaseUrl: string, options?: VolumeOptions) =>
  seedVolume(databaseUrl, "planche", options);

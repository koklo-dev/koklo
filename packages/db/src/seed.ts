import pg from "pg";
import { assertSeedAllowed } from "./seed-guard.ts";
import { buildSeedStatements } from "./seed-statements.ts";

export { SEED_IDS } from "./seed-data.ts";

export interface SeedOptions {
  /** Environnement évalué par le garde-fou ; `process.env` par défaut. */
  env?: { NODE_ENV?: string };
}

/**
 * Charge le jeu de démo (organisation, admin, client, projet, sprint actif, 6 tickets liés).
 * Idempotent : upserts par clés naturelles, enfants des tickets seedés réinsérés, compteurs
 * monotones, le tout en une seule transaction. Refuse de s'exécuter en production, avant
 * toute connexion. Aucun secret : pas de ligne `accounts`, donc aucun mot de passe seedé.
 */
export async function seed(databaseUrl: string, options: SeedOptions = {}): Promise<void> {
  assertSeedAllowed(options.env ?? process.env);
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query("BEGIN");
    for (const { sql, params } of buildSeedStatements()) {
      await client.query(sql, params);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

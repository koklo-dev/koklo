import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";

export const TEST_POSTGRES_IMAGE = "postgres:17-alpine";

/**
 * Point d'entrée unique pour un Postgres de test du worker.
 * L'image déclare `VOLUME /var/lib/postgresql/data` : sans tmpfs, chaque conteneur crée un volume
 * anonyme que `stop()` ne supprime pas. Le datadir est donc monté en tmpfs (RAM, disparaît avec le
 * conteneur). Le test appelant doit arrêter le conteneur dans `afterAll` ; Ryuk (jamais désactivé)
 * le récupère si le process meurt avant.
 */
export function startTestPostgres(): Promise<StartedPostgreSqlContainer> {
  return new PostgreSqlContainer(TEST_POSTGRES_IMAGE)
    .withTmpFs({ "/var/lib/postgresql/data": "rw" })
    .start();
}

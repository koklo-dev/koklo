import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import pg from "pg";

export const TEST_POSTGRES_IMAGE = "postgres:17-alpine";

const DRAIN_TIMEOUT_MS = 15_000;

/**
 * Attend que plus aucune connexion cliente (hors la sienne) ne soit ouverte sur la base. Les
 * fermetures de pools (pg-boss, adaptateur Prisma, banc) ne sont pas toutes attendues jusqu'au
 * bout par leurs `stop()` : arrêter le conteneur avant la fin de la poignée de main `Terminate`
 * fait émettre `57P01` par un client en cours de fermeture, erreur non gérée qui fait échouer vitest.
 */
async function waitForDrained(connectionUri: string): Promise<void> {
  const probe = new pg.Client({ connectionString: connectionUri });
  probe.on("error", () => undefined); // la sonde elle-même ne doit jamais faire tomber le run
  try {
    await probe.connect();
    const deadline = Date.now() + DRAIN_TIMEOUT_MS;
    for (;;) {
      const { rows } = await probe.query<{ others: number }>(
        `SELECT count(*)::int AS others FROM pg_stat_activity
         WHERE datname = current_database() AND pid <> pg_backend_pid() AND backend_type = 'client backend'`,
      );
      if ((rows[0]?.others ?? 0) === 0 || Date.now() > deadline) return;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  } catch {
    // base déjà arrêtée : rien à attendre
  } finally {
    await probe.end().catch(() => undefined);
  }
}

/**
 * Point d'entrée unique pour un Postgres de test du worker.
 * L'image déclare `VOLUME /var/lib/postgresql/data` : sans tmpfs, chaque conteneur crée un volume
 * anonyme que `stop()` ne supprime pas. Le datadir est donc monté en tmpfs (RAM, disparaît avec le
 * conteneur). Le test appelant doit arrêter le conteneur dans `afterAll` ; Ryuk (jamais désactivé)
 * le récupère si le process meurt avant. `stop()` attend d'abord la fermeture effective de toutes
 * les connexions clientes (voir `waitForDrained`).
 */
export async function startTestPostgres(): Promise<StartedPostgreSqlContainer> {
  const container = await new PostgreSqlContainer(TEST_POSTGRES_IMAGE)
    .withTmpFs({ "/var/lib/postgresql/data": "rw" })
    .start();
  const stop = container.stop.bind(container);
  container.stop = async (options) => {
    await waitForDrained(container.getConnectionUri());
    return stop(options);
  };
  return container;
}

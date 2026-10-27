import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import pg from "pg";

export interface TestDatabase {
  /** URL de la base jetable dédiée à ce fichier de test. */
  url: string;
  query: <Row extends pg.QueryResultRow>(sql: string, params?: unknown[]) => Promise<Row[]>;
  dispose: () => Promise<void>;
}

const IMAGE = "postgres:17-alpine";
const PASSWORD = "koklo-test";

function docker(args: string[]): string {
  return execFileSync("docker", args, { encoding: "utf8" }).trim();
}

function dockerAvailable(): boolean {
  try {
    docker(["info", "--format", "{{.ServerVersion}}"]);
    return true;
  } catch {
    return false;
  }
}

async function waitUntilReady(adminUrl: string): Promise<void> {
  const deadline = Date.now() + 60_000;
  let lastError: unknown;
  while (Date.now() < deadline) {
    const client = new pg.Client({ connectionString: adminUrl });
    try {
      await client.connect();
      await client.end();
      return;
    } catch (error) {
      lastError = error;
      await client.end().catch(() => undefined);
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw new Error(`Postgres éphémère injoignable : ${String(lastError)}`);
}

function withDatabaseName(url: string, name: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${name}`;
  return parsed.toString();
}

/** Démarre le conteneur éphémère sur un port hôte aléatoire (jamais 5432). */
function startContainer(): { containerId: string; adminUrl: string } {
  const containerId = docker([
    "run",
    "-d",
    "--rm",
    "-p",
    "127.0.0.1::5432",
    "-e",
    `POSTGRES_PASSWORD=${PASSWORD}`,
    IMAGE,
  ]);
  const mapping = docker(["port", containerId, "5432/tcp"]).split("\n")[0] ?? "";
  const port = mapping.split(":").at(-1);
  if (!port || port === "5432") {
    docker(["rm", "-f", containerId]);
    throw new Error(`Port hôte inattendu pour le Postgres éphémère : "${mapping}"`);
  }
  return { containerId, adminUrl: `postgresql://postgres:${PASSWORD}@127.0.0.1:${port}/postgres` };
}

/**
 * Fournit une base vide et isolée.
 * - `TEST_DATABASE_URL` défini : crée/supprime une base dédiée sur ce serveur.
 * - sinon : démarre un Postgres 17 éphémère sur un port hôte aléatoire (jamais 5432),
 *   supprimé à `dispose`.
 * - ni l'un ni l'autre : échec explicite (pas de skip).
 */
export async function createTestDatabase(): Promise<TestDatabase> {
  const externalUrl = process.env.TEST_DATABASE_URL;
  let containerId: string | undefined;
  let adminUrl: string;

  if (externalUrl) {
    adminUrl = externalUrl;
  } else if (dockerAvailable()) {
    ({ containerId, adminUrl } = startContainer());
  } else {
    throw new Error(
      "Aucune base de test : définir TEST_DATABASE_URL ou rendre Docker disponible. " +
        "Ce test ne se saute jamais.",
    );
  }

  const stopContainer = () => {
    if (containerId) {
      try {
        docker(["rm", "-f", containerId]);
      } catch {
        // déjà supprimé (--rm)
      }
    }
  };

  try {
    await waitUntilReady(adminUrl);
    const name = `koklo_test_${randomBytes(6).toString("hex")}`;
    const admin = new pg.Client({ connectionString: adminUrl });
    await admin.connect();
    await admin.query(`CREATE DATABASE ${name}`);
    await admin.end();

    const url = withDatabaseName(adminUrl, name);
    return {
      url,
      query: async (sql, params) => {
        const client = new pg.Client({ connectionString: url });
        await client.connect();
        try {
          const result = await client.query(sql, params);
          return result.rows;
        } finally {
          await client.end();
        }
      },
      dispose: async () => {
        if (externalUrl) {
          const cleaner = new pg.Client({ connectionString: adminUrl });
          await cleaner.connect();
          await cleaner.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
          await cleaner.end();
        }
        stopContainer();
      },
    };
  } catch (error) {
    stopContainer();
    throw error;
  }
}

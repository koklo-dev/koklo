import { spawnSync } from "node:child_process";
import { join } from "node:path";
import pg from "pg";
import { rollbackLatest } from "../src/rollback.ts";

const migrationsDir = join(import.meta.dirname, "..", "prisma", "migrations");

function loadEnv(): string {
  try {
    process.loadEnvFile();
  } catch {
    // pas de .env : la variable peut venir de l'environnement
  }
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL n'est pas défini (voir packages/db/.env.example)");
  }
  return url;
}

async function main(): Promise<void> {
  const databaseUrl = loadEnv();
  const name = await rollbackLatest(migrationsDir, {
    runSqlFile: (file) => {
      const result = spawnSync("prisma", ["db", "execute", "--file", file], {
        stdio: "inherit",
        env: process.env,
      });
      if (result.status !== 0) {
        throw new Error(`prisma db execute a échoué (code ${result.status})`);
      }
    },
    forgetMigration: async (migration) => {
      const client = new pg.Client({ connectionString: databaseUrl });
      await client.connect();
      try {
        await client.query("DELETE FROM _prisma_migrations WHERE migration_name = $1", [migration]);
      } finally {
        await client.end();
      }
    },
  });
  console.log(`Migration annulée : ${name}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

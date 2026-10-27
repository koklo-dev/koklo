/**
 * `pnpm dev` : Postgres (Compose, attente de l'état healthy) puis web, api et worker en parallèle.
 * Ports : web 3000, API 3001 (le web et l'API ne se disputent plus le 3000).
 * Toute variable déjà définie dans l'environnement l'emporte sur ces valeurs par défaut ;
 * BETTER_AUTH_SECRET et GITHUB_* restent à renseigner dans apps/api/.env (voir .env.example).
 */
import { spawn, spawnSync } from "node:child_process";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "../..");
const dbPort = process.env.KOKLO_DB_PORT ?? "5432";
const apiPort = process.env.KOKLO_API_PORT ?? "3001";

const env: NodeJS.ProcessEnv = {
  DATABASE_URL: `postgresql://koklo:koklo@127.0.0.1:${dbPort}/koklo`,
  PORT: apiPort,
  BETTER_AUTH_URL: `http://localhost:${apiPort}`,
  API_URL: `http://127.0.0.1:${apiPort}`,
  ...process.env,
};

const compose = spawnSync("docker", ["compose", "up", "-d", "--wait", "postgres"], {
  cwd: ROOT,
  env,
  stdio: "inherit",
});
if (compose.status !== 0) process.exit(compose.status ?? 1);

const turbo = spawn("pnpm", ["exec", "turbo", "run", "dev"], { cwd: ROOT, env, stdio: "inherit" });
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => turbo.kill(signal));
}
turbo.on("exit", (code) => process.exit(code ?? 0));

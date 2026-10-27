/**
 * `pnpm e2e` : Postgres (Compose) → migrate → seed → build → API + web → `playwright test`.
 * Le code de sortie est celui de Playwright. Tout ce qui est démarré est arrêté en fin de course.
 * Les valeurs ci-dessous sont factices et réservées à l'e2e : aucun secret réel.
 */
import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { cpSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "../..");
const DB_PORT = process.env.E2E_DB_PORT ?? "54329";
const WEB_PORT = process.env.E2E_WEB_PORT ?? "3200";
const API_PORT = process.env.E2E_API_PORT ?? "3201";
const WEB_URL = `http://127.0.0.1:${WEB_PORT}`;
const API_URL = `http://127.0.0.1:${API_PORT}`;
const COMPOSE = ["compose", "-p", "koklo-e2e", "-f", resolve(ROOT, "docker-compose.yml")];

const env: NodeJS.ProcessEnv = {
  ...process.env,
  KOKLO_DB_PORT: DB_PORT,
  DATABASE_URL: `postgresql://koklo:koklo@127.0.0.1:${DB_PORT}/koklo`,
  APP_ENV: "test",
  APP_VERSION: "0.0.0-e2e",
  BETTER_AUTH_SECRET: "e2e-only-fake-secret-not-for-production-0123456789",
  BETTER_AUTH_URL: API_URL,
  GITHUB_CLIENT_ID: "e2e-fake-github-client-id",
  GITHUB_CLIENT_SECRET: "e2e-fake-github-client-secret",
  E2E_WEB_URL: WEB_URL,
};

const servers: ChildProcess[] = [];

function run(command: string, args: string[]): void {
  const result = spawnSync(command, args, { cwd: ROOT, env, stdio: "inherit" });
  if (result.status !== 0) throw new Error(`échec : ${command} ${args.join(" ")}`);
}

function start(command: string, args: string[], extra: NodeJS.ProcessEnv = {}): void {
  const child = spawn(command, args, {
    cwd: ROOT,
    env: { ...env, ...extra },
    stdio: ["ignore", "inherit", "inherit"],
  });
  servers.push(child);
}

async function waitFor(url: string, timeoutMs = 120_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const exited = servers.find((s) => s.exitCode !== null);
    if (exited) throw new Error(`un serveur s'est arrêté avant ${url}`);
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // pas encore prêt
    }
    await new Promise((done) => setTimeout(done, 500));
  }
  throw new Error(`délai dépassé en attendant ${url}`);
}

function cleanup(): void {
  for (const server of servers) server.kill("SIGTERM");
  spawnSync("docker", [...COMPOSE, "down", "-v", "--remove-orphans"], {
    cwd: ROOT,
    stdio: "inherit",
  });
}

async function main(): Promise<number> {
  // Base neuve à chaque exécution : le seed et le test supposent un état connu.
  run("docker", [...COMPOSE, "down", "-v", "--remove-orphans"]);
  run("docker", [...COMPOSE, "up", "-d", "--wait", "postgres"]);
  run("pnpm", ["db:migrate"]);
  run("pnpm", ["db:seed"]);
  run("pnpm", ["build"]);

  start("node", ["apps/api/dist/main.js"], { PORT: API_PORT });
  // Sortie `standalone` : on copie les assets statiques à côté du serveur, comme l'image promouvable.
  const web = resolve(ROOT, "apps/web");
  const standalone = resolve(web, ".next/standalone/apps/web");
  cpSync(resolve(web, ".next/static"), resolve(standalone, ".next/static"), { recursive: true });
  if (existsSync(resolve(web, "public"))) {
    cpSync(resolve(web, "public"), resolve(standalone, "public"), { recursive: true });
  }
  start("node", [resolve(standalone, "server.js")], {
    API_URL,
    PORT: WEB_PORT,
    HOSTNAME: "127.0.0.1",
  });
  await waitFor(`${API_URL}/health`);
  await waitFor(`${WEB_URL}/login`);

  const playwright = spawnSync("pnpm", ["--filter", "@koklo/e2e", "exec", "playwright", "test"], {
    cwd: ROOT,
    env,
    stdio: "inherit",
  });
  return playwright.status ?? 1;
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    cleanup();
    process.exit(130);
  });
}

try {
  process.exitCode = await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  cleanup();
}

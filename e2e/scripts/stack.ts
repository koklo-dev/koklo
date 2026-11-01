/**
 * Lanceur de la pile e2e (ADR 0010) : l'API et le worker dans UN SEUL processus, avec un seul faux
 * fournisseur Git en mémoire. Le faux est injecté par `overrideProvider(GIT_PROVIDER)` et par
 * `startWorker(config, { gitProvider })`, comme dans les tests d'intégration de l'API : aucune
 * variable d'environnement ne peut le sélectionner, et le code de production ne l'importe jamais.
 * Ce fichier n'existe que dans `@koklo/e2e`, absent des images Docker.
 */
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// Premier geste, avant tout import de `dist`, connexion ou port : jamais en staging ni en production.
const FORBIDDEN_ENVS = ["staging", "production"];
const appEnv = process.env.APP_ENV;
if (appEnv !== undefined && FORBIDDEN_ENVS.includes(appEnv)) {
  console.error(
    `Refus de démarrer la pile e2e : APP_ENV=${appEnv} (le faux fournisseur Git n'est jamais lancé en ${FORBIDDEN_ENVS.join(" ni en ")}).`,
  );
  process.exit(1);
}

const ROOT = resolve(import.meta.dirname, "../..");
const dist = (path: string): string => pathToFileURL(resolve(ROOT, path)).href;
// Les dépendances de l'API se résolvent depuis son paquet (un seul exemplaire de Nest dans le processus).
const fromApi = createRequire(resolve(ROOT, "apps/api/package.json"));
const fromE2e = createRequire(import.meta.url);

/** Logins du faux OAuth, utilisables une fois chacun (parcours « installer l'App », 49c). */
const LINK_POOL = [
  { login: "e2e-link-1", org: "e2e-link-org-1", externalId: "9100001" },
  { login: "e2e-link-2", org: "e2e-link-org-2", externalId: "9100002" },
  { login: "e2e-link-3", org: "e2e-link-org-3", externalId: "9100003" },
];

// Interfaces minimales : `tsc` d'`e2e` n'exige pas que les `dist` existent.
interface Fake {
  seedUserInstallation(login: string, installation: Record<string, string>): void;
  seedOrgMembership(login: string, org: string, role: "admin" | "member" | "pending"): void;
}
interface Closable {
  close(): Promise<void>;
}
interface NestApp extends Closable {
  enableShutdownHooks(): void;
  listen(port: number): Promise<unknown>;
}

async function main(): Promise<void> {
  fromApi("reflect-metadata");
  const [{ InMemoryGitProvider }, { startWorker }, workerConfig, apiConfig, appModule, tokens] =
    await Promise.all([
      import(fromE2e.resolve("@koklo/github/testing")) as Promise<{
        InMemoryGitProvider: new (options: { now: () => Date; nextId: () => string }) => Fake;
      }>,
      import(fromE2e.resolve("@koklo/worker")) as Promise<{
        startWorker(config: unknown, options: { gitProvider: unknown }): Promise<Closable & object>;
      }>,
      import(dist("apps/worker/dist/config.js")) as Promise<{
        loadConfig(env: NodeJS.ProcessEnv): unknown;
      }>,
      import(dist("apps/api/dist/config.js")) as Promise<{
        loadConfig(env: NodeJS.ProcessEnv): { port: number };
      }>,
      import(dist("apps/api/dist/app.module.js")) as Promise<{
        AppModule: { forRoot(config: unknown): unknown };
      }>,
      import(dist("apps/api/dist/repo/tokens.js")) as Promise<{ GIT_PROVIDER: symbol }>,
    ]);
  const { Test } = (await import(fromApi.resolve("@nestjs/testing"))) as {
    Test: {
      createTestingModule(metadata: { imports: unknown[] }): {
        overrideProvider(token: symbol): { useValue(value: unknown): unknown };
      };
    };
  };

  // Identifiants numériques : ils deviennent `repository.id` des webhooks (entier sûr exigé).
  let counter = 0;
  const fake = new InMemoryGitProvider({ now: () => new Date(), nextId: () => String(++counter) });
  for (const { login, org, externalId } of LINK_POOL) {
    fake.seedUserInstallation(login, { externalId, ownerKind: "organization", ownerLogin: org });
    fake.seedOrgMembership(login, org, "admin");
  }

  const worker = await startWorker(workerConfig.loadConfig(process.env), { gitProvider: fake });
  const config = apiConfig.loadConfig(process.env);
  const builder = Test.createTestingModule({ imports: [appModule.AppModule.forRoot(config)] });
  const module = builder.overrideProvider(tokens.GIT_PROVIDER).useValue(fake) as {
    compile(): Promise<{ createNestApplication(): NestApp }>;
  };
  const app = (await module.compile()).createNestApplication();
  // Journal Nest par défaut : l'e2e n'a pas besoin du journal pino de `main.ts`.
  app.enableShutdownHooks();
  await app.listen(config.port);

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => {
      void (worker as Closable & { stop(): Promise<void> }).stop().finally(() => {
        void app.close().finally(() => process.exit(0));
      });
    });
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

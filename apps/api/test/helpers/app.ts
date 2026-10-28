import { seed } from "@koklo/db";
import { createTestDatabase, migrateDeploy, type TestDatabase } from "@koklo/db/testing";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { AppModule } from "../../src/app.module.ts";
import type { AppConfig } from "../../src/config.ts";
import { DATABASE_PROBE, type DatabaseProbe } from "../../src/health/database-probe.ts";

/** URL qui refuse immédiatement la connexion (port 1) : simule une base coupée. */
export const UNREACHABLE_DATABASE_URL = "postgresql://koklo:secret-pw@127.0.0.1:1/koklo";

export const TEST_AUTH_SECRET = "test-secret-test-secret-test-secret-0123";
export const TEST_AUTH_URL = "http://localhost:3000";
export const TEST_GITHUB_CLIENT_ID = "test-github-client-id";
export const TEST_GITHUB_CLIENT_SECRET = "test-github-client-secret";

export interface AppOptions {
  databaseUrl: string;
  appVersion?: string;
  /** Défaut : "test" (seul environnement où la session de test est enregistrée). */
  appEnv?: AppConfig["appEnv"];
  /**
   * Absent : câblage réel (session Better Auth, sinon en-tête de test). Présent : le résolveur de
   * session (token SESSION_RESOLVER) est remplacé par une session fixe de cette organisation, ce
   * qui garde les tests d'isolation C1.1 à C1.9 de project-list.test.ts inchangés.
   */
  organizationId?: string;
  probe?: DatabaseProbe;
}

export function configFor(
  options: Pick<AppOptions, "databaseUrl" | "appVersion" | "appEnv">,
): AppConfig {
  return {
    databaseUrl: options.databaseUrl,
    port: 0,
    appEnv: options.appEnv ?? "test",
    appVersion: options.appVersion ?? "dev",
    betterAuthSecret: TEST_AUTH_SECRET,
    betterAuthUrl: TEST_AUTH_URL,
    githubClientId: TEST_GITHUB_CLIENT_ID,
    githubClientSecret: TEST_GITHUB_CLIENT_SECRET,
    logLevel: "silent",
    sentryDsn: undefined,
  };
}

/** Application Nest réelle (client Prisma réel) ; seuls les ports demandés sont remplacés. */
export async function createApp(options: AppOptions): Promise<INestApplication> {
  let builder = Test.createTestingModule({
    imports: [AppModule.forRoot(configFor(options))],
  });
  if (options.organizationId !== undefined) {
    const organizationId = options.organizationId;
    // Import différé : seuls les tests qui fixent l'organisation dépendent du module d'auth.
    const { SESSION_RESOLVER } = await import("../../src/auth/session.ts");
    const resolver = { resolve: async () => ({ userId: "fixed-user", organizationId }) };
    builder = builder.overrideProvider(SESSION_RESOLVER).useValue(resolver);
  }
  if (options.probe) {
    builder = builder.overrideProvider(DATABASE_PROBE).useValue(options.probe);
  }
  const app = (await builder.compile()).createNestApplication();
  await app.init();
  return app;
}

/** Base éphémère migrée puis peuplée par le seed. */
export async function createSeededDatabase(): Promise<TestDatabase> {
  const database = await createTestDatabase();
  try {
    migrateDeploy(database.url);
    await seed(database.url);
  } catch (error) {
    await database.dispose();
    throw error;
  }
  return database;
}

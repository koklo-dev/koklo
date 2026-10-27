import { seed } from "@koklo/db";
import { createTestDatabase, migrateDeploy, type TestDatabase } from "@koklo/db/testing";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { AppModule } from "../../src/app.module.ts";
import type { AppConfig } from "../../src/config.ts";
import { DATABASE_PROBE, type DatabaseProbe } from "../../src/health/database-probe.ts";
import {
  ORGANIZATION_CONTEXT,
  type OrganizationContext,
} from "../../src/project/organization-context.ts";

/** URL qui refuse immédiatement la connexion (port 1) : simule une base coupée. */
export const UNREACHABLE_DATABASE_URL = "postgresql://koklo:secret-pw@127.0.0.1:1/koklo";

export interface AppOptions {
  databaseUrl: string;
  appVersion?: string;
  /** Absent : l'application est câblée par défaut (contexte d'organisation fermé). */
  organizationId?: string;
  probe?: DatabaseProbe;
}

export function configFor(options: Pick<AppOptions, "databaseUrl" | "appVersion">): AppConfig {
  return {
    databaseUrl: options.databaseUrl,
    port: 0,
    appEnv: "test",
    appVersion: options.appVersion ?? "dev",
  };
}

/** Application Nest réelle (client Prisma réel) ; seuls les ports demandés sont remplacés. */
export async function createApp(options: AppOptions): Promise<INestApplication> {
  let builder = Test.createTestingModule({
    imports: [AppModule.forRoot(configFor(options))],
  });
  if (options.organizationId !== undefined) {
    const organizationId = options.organizationId;
    const context: OrganizationContext = { organizationId: async () => organizationId };
    builder = builder.overrideProvider(ORGANIZATION_CONTEXT).useValue(context);
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

import { runPrismaOrThrow } from "./prisma-cli.ts";

export { createTestDatabase, type TestDatabase } from "./test-database.ts";

/** Applique les migrations versionnées (`prisma migrate deploy`) sur `databaseUrl` ; lève en cas d'échec. */
export function migrateDeploy(databaseUrl: string): void {
  runPrismaOrThrow(["migrate", "deploy"], databaseUrl);
}

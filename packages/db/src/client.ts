import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/client.ts";
import { type TenantClient, withTenantIsolation } from "./tenant-extension.ts";

export type { PrismaClient, TenantClient };

/** Client Prisma 7 brut (pool `pg`) : seed, tests, sonde de santé, Better Auth. Fermer avec `$disconnect()`. */
export function createRawDbClient(databaseUrl: string): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
}

/** Client multi-tenant : les modèles métier exigent `withOrganization` et sont filtrés par lui. */
export function createDbClient(databaseUrl: string): TenantClient {
  return withTenantIsolation(createRawDbClient(databaseUrl));
}

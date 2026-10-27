import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/client.ts";

export type { PrismaClient };

/** Client Prisma 7 sur un pool `pg` ; l'appelant le ferme avec `$disconnect()`. */
export function createDbClient(databaseUrl: string): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
}

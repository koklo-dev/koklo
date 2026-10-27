import { defineConfig } from "prisma/config";

try {
  process.loadEnvFile();
} catch {
  // pas de .env : les variables viennent de l'environnement
}

// process.env (et non env()) : `prisma generate` doit fonctionner sans base configurée.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: {
    url: process.env.DATABASE_URL ?? "",
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
  },
});

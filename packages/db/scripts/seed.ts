import { seed } from "../src/seed.ts";

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

seed(loadEnv())
  .then(() => console.log("Seed de démo appliqué."))
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });

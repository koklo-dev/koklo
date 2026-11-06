import { seed } from "../src/seed.ts";
import { loadDatabaseUrl } from "./load-database-url.ts";

seed(loadDatabaseUrl())
  .then(() => console.log("Seed de démo appliqué."))
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });

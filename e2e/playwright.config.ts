import { defineConfig } from "@playwright/test";

// Le test vise le vrai stack (Postgres seedé, API, web) déjà démarré à E2E_WEB_URL par `pnpm e2e`
// (e2e/scripts/run.ts) ; cette config ne démarre aucun serveur.
const channel = process.env.PLAYWRIGHT_CHANNEL;

export default defineConfig({
  testDir: "tests",
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    trace: "retain-on-failure",
    baseURL: process.env.E2E_WEB_URL ?? "http://127.0.0.1:3100",
    ...(channel ? { channel } : {}),
  },
});

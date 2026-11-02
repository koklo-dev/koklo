import { defineConfig } from "@playwright/test";

// PLAYWRIGHT_CHANNEL=chrome réutilise un Chrome déjà installé ; sinon `playwright install chromium`.
const channel = process.env.PLAYWRIGHT_CHANNEL;
// Ports surchargeables (E2E_WEB_PORT, E2E_API_PORT) pour lancer deux sessions côte à côte sans collision.
const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 3100);
const API_PORT = Number(process.env.E2E_API_PORT ?? 3101);

export default defineConfig({
  testDir: "e2e",
  // Le faux API est partagé et piloté par scénario : un seul worker pour éviter les courses.
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: `http://127.0.0.1:${WEB_PORT}`, ...(channel ? { channel } : {}) },
  webServer: [
    {
      // Faux API (session + project.list) : aucune dépendance à Postgres.
      command: "node e2e/support/stub-api.ts",
      env: { STUB_API_PORT: String(API_PORT) },
      url: `http://127.0.0.1:${API_PORT}/__health`,
      reuseExistingServer: false,
    },
    {
      // L'API cible est lue à l'exécution (API_INTERNAL_URL), jamais via NEXT_PUBLIC_*.
      command: `pnpm exec next dev --port ${WEB_PORT}`,
      env: {
        API_INTERNAL_URL: `http://127.0.0.1:${API_PORT}`,
        APP_ENV: "test",
        APP_VERSION: "0.0.0-test",
      },
      url: `http://127.0.0.1:${WEB_PORT}/login`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});

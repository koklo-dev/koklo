import { defineConfig } from "@playwright/test";

// PLAYWRIGHT_CHANNEL=chrome réutilise un Chrome déjà installé ; sinon `playwright install chromium`.
const channel = process.env.PLAYWRIGHT_CHANNEL;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  reporter: [["list"]],
  use: { ...(channel ? { channel } : {}) },
});

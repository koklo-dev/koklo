import { resolve } from "node:path";
import type { Page } from "@playwright/test";

export type ProjectsState = "loading" | "empty" | "data" | "error";
export type Theme = "light" | "dark";

const STUB = "http://127.0.0.1:3101";

/** Captures jointes à la PR : design/screens/captures/<écran>/<état>-<thème>.png */
export const CAPTURES_DIR = resolve(import.meta.dirname, "../../../../design/screens/captures");

export async function setScenario(scenario: {
  session: boolean;
  projects: "loading" | "empty" | "data" | "internal" | "unauthorized";
}): Promise<void> {
  await fetch(`${STUB}/__scenario`, { method: "POST", body: JSON.stringify(scenario) });
}

export async function releaseHeld(): Promise<void> {
  await fetch(`${STUB}/__release`, { method: "POST" });
}

/** Le thème par défaut est clair ; le sombre s'obtient par la bascule, comme pour une vraie personne. */
export async function switchToDark(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Passer au thème sombre" }).first().click();
}

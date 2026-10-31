import { resolve } from "node:path";
import { expect, type Page } from "@playwright/test";
import type { GithubScenario } from "./stub-github.ts";
import type {
  BoardMode as KanbanBoard,
  KanbanRole,
  TransitionMode as KanbanTransition,
} from "./stub-kanban.ts";
import type { SpecRepoScenario } from "./stub-spec-repo.ts";

export type ProjectsState = "loading" | "empty" | "data" | "error";
export type Theme = "light" | "dark";

const STUB = "http://127.0.0.1:3101";

/** Captures jointes à la PR : design/screens/captures/<écran>/<état>-<thème>.png */
export const CAPTURES_DIR = resolve(import.meta.dirname, "../../../../design/screens/captures");

export type { KanbanBoard, KanbanRole, KanbanTransition };

export async function setScenario(
  scenario: {
    board?: KanbanBoard;
    transition?: KanbanTransition;
    role?: KanbanRole;
    session: boolean;
    projects: "loading" | "empty" | "data" | "internal" | "unauthorized";
    organizations?: "none" | "one" | "many";
    activeOrganization?: boolean;
    invitation?: "ready" | "member" | "wrong" | "invalid";
  } & GithubScenario &
    SpecRepoScenario,
): Promise<void> {
  await fetch(`${STUB}/__scenario`, { method: "POST", body: JSON.stringify(scenario) });
}

/** Transitions reçues par le faux API (`POST /tickets/{key}/transition`), dans l'ordre. */
export async function transitionsSeen(): Promise<Array<{ key: string; to: string }>> {
  return (await fetch(`${STUB}/__transitions`)).json();
}

/** Corps reçus par `installation.start` sur le faux API, dans l'ordre. */
export async function githubStartsSeen(): Promise<unknown[]> {
  return (await fetch(`${STUB}/__github-starts`)).json();
}

/** Corps reçus par `project.create`, `repo.createSpec` et `repo.link` sur le faux API, dans l'ordre. */
export const projectCreatesSeen = async (): Promise<Array<{ name: string }>> =>
  (await fetch(`${STUB}/__project-creates`)).json();
export const specRepoCallsSeen = async (): Promise<Array<Record<string, unknown>>> =>
  (await fetch(`${STUB}/__spec-repo-calls`)).json();
export const repoLinksSeen = async (): Promise<Array<Record<string, unknown>>> =>
  (await fetch(`${STUB}/__repo-links`)).json();

export async function releaseHeld(): Promise<void> {
  await fetch(`${STUB}/__release`, { method: "POST" });
}

/**
 * Le thème par défaut est clair ; le sombre s'obtient par la bascule, comme pour une vraie personne.
 * Sur /login la bascule est un bouton ; dans le gabarit (TK-85) elle vit dans le menu « Menu utilisateur ».
 */
export async function switchToDark(page: Page): Promise<void> {
  // Avant l'hydratation le clic est sans effet : on le rejoue jusqu'à ce que la classe `dark` soit posée.
  await expect(async () => {
    const userMenu = page.getByRole("button", { name: "Menu utilisateur" });
    if (await userMenu.count()) {
      await userMenu.first().click({ timeout: 2_000 });
      await page
        .getByRole("menuitem", { name: "Passer au thème sombre" })
        .click({ timeout: 2_000 });
    } else {
      await page
        .getByRole("button", { name: "Passer au thème sombre" })
        .first()
        .click({ timeout: 2_000 });
    }
    await expect(page.locator("html")).toHaveClass(/dark/, { timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
}

/** Barre latérale du gabarit (bloc sidebar-07) et son bouton de repli. */
export const sidebarOf = (page: Page) => page.locator('[data-slot="sidebar"]');
export const triggerOf = (page: Page) => page.locator('[data-sidebar="trigger"]');

/** Attend la fin des transitions CSS (bascule de thème) ; une animation annulée en cours de route ne fait pas échouer. */
export async function settle(page: Page): Promise<void> {
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getTiming().iterations !== Number.POSITIVE_INFINITY)
        .map((a) => a.finished.catch(() => undefined)),
    ),
  );
}

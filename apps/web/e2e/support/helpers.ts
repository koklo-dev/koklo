import { resolve } from "node:path";
import { expect, type Page } from "@playwright/test";
import type { AiScenario } from "./stub-ai.ts";
import type { FeaturesScenario } from "./stub-features.ts";
import type { GithubScenario } from "./stub-github.ts";
import type {
  BoardMode as KanbanBoard,
  KanbanRole,
  TransitionMode as KanbanTransition,
} from "./stub-kanban.ts";
import type { LlmScenario } from "./stub-llm-credential.ts";
import type { SpecRepoScenario } from "./stub-spec-repo.ts";

/** Jeux de règles axe communs à toutes les specs (WCAG 2.0 à 2.2, A et AA) : un écran ne peut
 * pas en omettre un, sinon un défaut de niveau A comme « Label in Name » (2.5.3) lui échappe. */
export const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

export type ProjectsState = "loading" | "empty" | "data" | "error";
export type Theme = "light" | "dark";

const STUB = `http://127.0.0.1:${process.env.E2E_API_PORT ?? 3101}`;

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
    SpecRepoScenario &
    FeaturesScenario &
    AiScenario &
    LlmScenario,
): Promise<void> {
  await fetch(`${STUB}/__scenario`, { method: "POST", body: JSON.stringify(scenario) });
}

/** Transitions reçues par le faux API (`POST /projects/{projectId}/tickets/{key}/transition`), dans l'ordre. */
export async function transitionsSeen(): Promise<Array<{ key: string; to: string }>> {
  return (await fetch(`${STUB}/__transitions`)).json();
}

/** Requêtes `ticket.list` reçues par le faux API (chemin et query), dans l'ordre. */
export async function ticketReadsSeen(): Promise<string[]> {
  return (await fetch(`${STUB}/__ticket-reads`)).json();
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
    const trigger = page.locator('[data-sidebar="trigger"]').first();
    // Sous 768 px la barre latérale est un panneau : on l'ouvre pour atteindre le menu, puis on le referme.
    const drawer = !(await userMenu.count()) && (await trigger.isVisible());
    if (drawer) await trigger.click({ timeout: 2_000 });
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
    if (drawer) await page.keyboard.press("Escape");
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

/** Lectures reçues par le faux API de l'écran des fonctionnalités (`spec.*`, `repo.list`), dans l'ordre. */
export const specReadsSeen = async (): Promise<string[]> =>
  (await fetch(`${STUB}/__spec-reads`)).json();

/** Écritures reçues par le faux API (`specBatch.submit` : corps ; `specBatch.get` : lot lu), dans l'ordre. */
export interface SpecWrite {
  kind: "submit" | "get";
  idempotencyKey?: string;
  baseSha?: string;
  operations?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}
export const specWritesSeen = async (): Promise<SpecWrite[]> =>
  (await fetch(`${STUB}/__spec-writes`)).json();

/** Appels `ai.draftBrief` (`brief`) et `ai.proposeFeatures` (`features`) reçus par le faux modèle, dans l'ordre. */
export interface AiCall {
  kind: "brief" | "features";
  body: Record<string, unknown>;
}
export const aiCallsSeen = async (): Promise<AiCall[]> =>
  (await fetch(`${STUB}/__ai-calls`)).json();

/** Appels `llmCredential.*` reçus par le faux API (le corps du PUT porte la clé), dans l'ordre. */
export interface LlmCall {
  method: string;
  path: string;
  body: unknown;
}
export const llmCallsSeen = async (): Promise<LlmCall[]> =>
  (await fetch(`${STUB}/__llm-calls`)).json();
/** Nombre de requêtes dont l'URL, la query ou un en-tête (hors corps) contenait la clé de test. */
export const llmSecretLeaks = async (): Promise<number> =>
  ((await (await fetch(`${STUB}/__llm-secret-leaks`)).json()) as { leaks: number }).leaks;

import { expect, test } from "@playwright/test";
import { createAdminSessionCookie, SESSION_COOKIE } from "../support/session.ts";

test.beforeEach(async ({ context, baseURL }) => {
  const value = await createAdminSessionCookie();
  await context.addCookies([{ name: SESSION_COOKIE, value, url: baseURL as string }]);
});

const column = (page: import("@playwright/test").Page, status: string) =>
  page.getByTestId(`kanban-column-${status}`);

test("kanban : le sprint actif du seed est réparti dans les 7 colonnes (vrai API)", async ({
  page,
}) => {
  await page.goto("/kanban");
  await expect(page.getByTestId("kanban-board")).toBeVisible();
  await expect(page.getByText(/^Sprint SP-1 · /)).toBeVisible();
  await expect(page.getByRole("heading", { level: 2 })).toHaveText([
    "Backlog",
    "À faire",
    "En cours",
    "En revue",
    "Bloqué",
    "Terminé",
    "Annulé",
  ]);
  await expect(column(page, "backlog").getByTestId("kanban-card-TK-6")).toBeVisible();
  await expect(column(page, "todo").getByTestId("kanban-card-TK-5")).toBeVisible();
  await expect(column(page, "in_review").getByTestId("kanban-card-TK-3")).toBeVisible();
  await expect(column(page, "done").getByTestId("kanban-card-TK-1")).toBeVisible();
});

test("kanban : « Déplacer » fait passer TK-6 de « Backlog » à « À faire », et le serveur le garde", async ({
  page,
}) => {
  await page.goto("/kanban");
  await page.getByRole("button", { name: "Déplacer TK-6" }).click();
  await page.getByRole("menuitem", { name: "À faire" }).click();
  await expect(column(page, "todo").getByTestId("kanban-card-TK-6")).toBeVisible();
  await expect(
    page.getByRole("status").filter({ hasText: "TK-6 déplacé vers À faire." }),
  ).toBeVisible();

  await page.reload();
  await expect(column(page, "todo").getByTestId("kanban-card-TK-6")).toBeVisible();
});

test("kanban : une transition interdite par le serveur est refusée avec départ et arrivée", async ({
  page,
}) => {
  await page.goto("/kanban");
  await page.getByRole("button", { name: "Déplacer TK-5" }).click();
  await page.getByRole("menuitem", { name: "Terminé" }).click();
  await expect(page.getByRole("alert").filter({ hasText: /\S/ })).toContainText(
    "Transition interdite : TK-5 ne peut pas passer de « À faire » à « Terminé ».",
  );
  await expect(column(page, "todo").getByTestId("kanban-card-TK-5")).toBeVisible();
});

test("kanban : sans session, /kanban redirige vers /login", async ({ page, context }) => {
  await context.clearCookies();
  await page.goto("/kanban");
  await expect(page).toHaveURL(/\/login$/);
});

import { expect, type Page, test } from "@playwright/test";
import { createSessionCookieWithoutOrganization, SESSION_COOKIE } from "../support/session.ts";

async function signInWithoutOrganization(page: Page, baseURL: string | undefined) {
  const value = await createSessionCookieWithoutOrganization();
  await page.context().addCookies([{ name: SESSION_COOKIE, value, url: baseURL as string }]);
}

test("C1 : session sans organisation → créer une organisation → créer un projet", async ({
  page,
  baseURL,
}) => {
  await signInWithoutOrganization(page, baseURL);
  const organizationName = `Atelier ${Date.now()}`;
  const projectName = `Refonte ${Date.now()}`;

  // C1.a : mené à la création d'organisation, pas à /login.
  await page.goto("/projects");
  await expect(page).toHaveURL(/\/organizations$/);
  await expect(page.getByTestId("organizations-page")).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 1, name: "Créer votre organisation" }),
  ).toBeVisible();

  // C1.b : création, l'organisation devient active, arrivée sur /projects à l'état vide (propriétaire).
  await page.getByLabel("Nom de l'organisation").fill(organizationName);
  await page.getByRole("button", { name: "Créer l'organisation" }).click();
  await expect(page).toHaveURL(/\/projects$/);
  await expect(page.getByRole("heading", { level: 1, name: "Projets" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Aucun projet pour le moment" })).toBeVisible();
  await expect(page.getByTestId("create-project-button")).toBeVisible();

  // C1.c : création d'un projet depuis le panneau, la ligne apparaît et le compteur passe à 1.
  await page.getByTestId("create-project-button").click();
  const sheet = page.getByRole("dialog", { name: "Créer un projet" });
  await sheet.getByLabel("Nom du projet").fill(projectName);
  // Cette pile e2e n'a aucune installation GitHub : le projet est créé sans dépôt de spec (design 48c §2),
  // le panneau reste ouvert sur la notice « Relier GitHub » jusqu'à ce qu'on le ferme.
  await expect(sheet.getByText("Aucun compte GitHub n'est relié", { exact: false })).toBeVisible();
  await sheet.getByRole("button", { name: "Créer le projet" }).click();
  await expect(sheet.getByText(`Projet « ${projectName} » créé, sans dépôt de spec`)).toBeVisible();
  await expect(sheet.getByRole("link", { name: "Relier GitHub" })).toBeVisible();
  await sheet.getByRole("button", { name: "Fermer", exact: true }).click();
  await expect(sheet).toBeHidden();
  await expect(page.getByRole("cell", { name: projectName })).toBeVisible();
  await expect(page.getByText("1 projet", { exact: true })).toBeVisible();
});

test("G1 : session sans organisation active ne boucle pas entre /login et /projects", async ({
  page,
  baseURL,
}) => {
  await signInWithoutOrganization(page, baseURL);
  const visited: string[] = [];
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) visited.push(new URL(frame.url()).pathname);
  });

  await page.goto("/login");
  await expect(page).toHaveURL(/\/organizations$/);
  await page.goto("/projects");
  await expect(page).toHaveURL(/\/organizations$/);
  await page.waitForTimeout(1_000);

  await expect(page).toHaveURL(/\/organizations$/);
  expect(visited.filter((path) => path === "/login")).toHaveLength(0);
  expect(visited.length).toBeLessThan(8);
});

test("C1.d : sans session, /projects, /members et /organizations redirigent vers /login", async ({
  page,
}) => {
  for (const path of ["/projects", "/members", "/organizations"]) {
    await page.goto(path);
    await expect(page, `${path} sans session`).toHaveURL(/\/login$/);
  }
});

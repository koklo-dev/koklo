import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import {
  createUserSession,
  insertInvitation,
  readActiveOrganization,
  readInvitationStatus,
  readMembership,
  uniqueEmail,
} from "../support/invitation.ts";
import { createAdminSessionCookie, SEED, SESSION_COOKIE } from "../support/session.ts";

const ORGANIZATION_NAME = "Organisation de démo";
const INVALID_TITLE = "Cette invitation n'est plus valide";

async function signInAs(page: Page, baseURL: string | undefined, cookie: string) {
  await page
    .context()
    .addCookies([{ name: SESSION_COOKIE, value: cookie, url: baseURL as string }]);
}

async function open(page: Page, id: string) {
  const response = await page.goto(`/accept-invitation/${id}`);
  expect(response?.status(), "la route ne renvoie jamais 404 (C2.f)").not.toBe(404);
  return response;
}

async function invitedUser(page: Page, baseURL: string | undefined, role = "dev") {
  const user = await createUserSession(uniqueEmail("invite"));
  const id = await insertInvitation({ email: user.email, role });
  await signInAs(page, baseURL, user.cookie);
  return { user, id };
}

/** L'annonceur de routes de Next (`#__next-route-announcer__`) est lui aussi `role=alert` : on cible la page. */
const alertOf = (page: Page) => page.getByTestId("accept-invitation-page").getByRole("alert");

const mainIsNotEmpty = (page: Page) =>
  expect(page.getByTestId("accept-invitation-page")).not.toBeEmpty();

test("C1 : l'invité connecté accepte, rejoint l'organisation avec le rôle et l'organisation devient active", async ({
  page,
  baseURL,
}) => {
  const { user, id } = await invitedUser(page, baseURL, "dev");

  // C1.a : aperçu visible du seul destinataire.
  await open(page, id);
  await expect(page.getByRole("heading", { level: 1, name: /^Rejoindre .+/ })).toBeVisible();
  await expect(page.getByTestId("accept-invitation-page")).toContainText("Développeur");

  // C1.b : acceptation, arrivée sur /projects sans passer par /organizations.
  const visited: string[] = [];
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) visited.push(new URL(frame.url()).pathname);
  });
  await page.getByRole("button", { name: "Accepter l'invitation" }).click();
  await expect(page).toHaveURL(/\/projects$/);
  expect(visited).not.toContain("/organizations");
  expect(await readActiveOrganization(user.userId)).toBe(SEED.organization);
  expect(await readInvitationStatus(id)).toBe("accepted");
  expect(await readMembership(user.userId)).toEqual({ role: "dev", count: 1 });

  // C1.c : un administrateur voit l'invité dans /members avec le rôle.
  const admin = await page.context().browser()?.newContext({ baseURL });
  if (!admin) throw new Error("contexte admin indisponible");
  try {
    const adminPage = await admin.newPage();
    await admin.addCookies([
      { name: SESSION_COOKIE, value: await createAdminSessionCookie(), url: baseURL as string },
    ]);
    await adminPage.goto("/members");
    const row = adminPage.getByRole("row", { name: new RegExp(user.email) });
    await expect(row).toBeVisible();
    await expect(row).toContainText("Développeur");
  } finally {
    await admin.close();
  }
});

test("C1.d : une seconde acceptation de la même invitation est refusée (écran « plus valide »)", async ({
  page,
  baseURL,
}) => {
  const { id } = await invitedUser(page, baseURL);
  await open(page, id);
  await page.getByRole("button", { name: "Accepter l'invitation" }).click();
  await expect(page).toHaveURL(/\/projects$/);
  await open(page, id);
  await expect(page.getByRole("heading", { level: 1, name: INVALID_TITLE })).toBeVisible();
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'un écran, un test par comportement
test.describe("C2 : cas d'erreur, jamais de 404 ni de page vide", () => {
  test("C2.a id inconnu", async ({ page, baseURL }) => {
    const user = await createUserSession(uniqueEmail("inconnu"));
    await signInAs(page, baseURL, user.cookie);
    await open(page, randomUUID());
    await expect(page.getByRole("heading", { level: 1, name: INVALID_TITLE })).toBeVisible();
    await expect(alertOf(page)).toContainText("Demandez un nouveau lien");
    await mainIsNotEmpty(page);
  });

  test("C2.a invitation expirée", async ({ page, baseURL }) => {
    const user = await createUserSession(uniqueEmail("expiree"));
    const id = await insertInvitation({ email: user.email, expiresInDays: -1 });
    await signInAs(page, baseURL, user.cookie);
    await open(page, id);
    await expect(page.getByRole("heading", { level: 1, name: INVALID_TITLE })).toBeVisible();
  });

  test("C2.a invitation annulée", async ({ page, baseURL }) => {
    const user = await createUserSession(uniqueEmail("annulee"));
    const id = await insertInvitation({ email: user.email, status: "canceled" });
    await signInAs(page, baseURL, user.cookie);
    await open(page, id);
    await expect(page.getByRole("heading", { level: 1, name: INVALID_TITLE })).toBeVisible();
  });

  test("C2.b id non-UUID : même écran, sans 404", async ({ page, baseURL }) => {
    const user = await createUserSession(uniqueEmail("nonuuid"));
    await signInAs(page, baseURL, user.cookie);
    await open(page, "abc");
    await expect(page.getByRole("heading", { level: 1, name: INVALID_TITLE })).toBeVisible();
  });

  test("C2.c adresse différente : adresse de session seulement, ni l'invitée ni l'organisation (C4.b)", async ({
    page,
    baseURL,
  }) => {
    const invited = uniqueEmail("destinataire");
    const id = await insertInvitation({ email: invited });
    const other = await createUserSession(uniqueEmail("autre"));
    await signInAs(page, baseURL, other.cookie);
    await open(page, id);
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Cette invitation est destinée à une autre adresse",
      }),
    ).toBeVisible();
    const content = page.getByTestId("accept-invitation-page");
    await expect(content).toContainText(other.email);
    await expect(content).not.toContainText(invited);
    await expect(content).not.toContainText(ORGANIZATION_NAME);
    await expect(page.getByRole("button", { name: "Se déconnecter" })).toBeVisible();
    expect(await readInvitationStatus(id)).toBe("pending");
  });

  test("C2.d déjà membre : information et accès aux projets, aucun doublon de membre", async ({
    page,
    baseURL,
  }) => {
    const member = await createUserSession(uniqueEmail("membre"), { memberRole: "designer" });
    const id = await insertInvitation({ email: member.email, role: "dev" });
    await signInAs(page, baseURL, member.cookie);
    await open(page, id);
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Vous faites déjà partie de cette organisation",
      }),
    ).toBeVisible();
    await expect(alertOf(page)).toHaveCount(0);
    await page.getByRole("button", { name: "Ouvrir mes projets" }).click();
    await expect(page).toHaveURL(/\/projects$/);
    expect(await readMembership(member.userId)).toEqual({ role: "designer", count: 1 });
  });

  test("C2.e erreur serveur à l'aperçu : alerte distincte, « Réessayer » puis aperçu", async ({
    page,
    baseURL,
  }) => {
    const { id } = await invitedUser(page, baseURL);
    let failures = 1;
    await page.route("**/api/auth/organization/get-invitation**", (route) =>
      failures-- > 0 ? route.fulfill({ status: 500, json: { message: "boom" } }) : route.continue(),
    );
    await open(page, id);
    await expect(
      page.getByRole("heading", { level: 1, name: "Impossible de continuer" }),
    ).toBeVisible();
    await expect(alertOf(page)).toContainText("Vérifiez votre connexion puis réessayez");
    await page.getByRole("button", { name: "Réessayer" }).click();
    await expect(page.getByRole("heading", { level: 1, name: /^Rejoindre / })).toBeVisible();
  });
});

test.describe("C3 : sans session", () => {
  test("C3.a /accept-invitation/<id> redirige vers /login?next=…, rien de l'invitation n'est révélé (C4.a)", async ({
    page,
  }) => {
    const id = await insertInvitation({ email: uniqueEmail("anonyme") });
    await page.goto(`/accept-invitation/${id}`);
    await expect(page).toHaveURL(new RegExp(`/login\\?next=%2Faccept-invitation%2F${id}$`));
    const body = await page.content();
    for (const secret of [ORGANIZATION_NAME, "Développeur", "Rejoindre"]) {
      expect(body).not.toContain(secret);
    }
  });

  test("C4.a la redirection d'un id inconnu est indiscernable de celle d'un id existant", async ({
    request,
  }) => {
    const known = await insertInvitation({ email: uniqueEmail("oracle") });
    const probe = async (id: string) => {
      const response = await request.get(`/accept-invitation/${id}`, { maxRedirects: 0 });
      return [response.status(), new URL(response.headers().location ?? "", "http://x").pathname];
    };
    expect(await probe(known)).toEqual([307, "/login"]);
    expect(await probe(randomUUID())).toEqual([307, "/login"]);
  });

  test("C3.b la connexion depuis /login?next= transmet l'invitation comme callbackURL", async ({
    page,
  }) => {
    const id = randomUUID();
    await page.goto(`/login?next=${encodeURIComponent(`/accept-invitation/${id}`)}`);
    await page.route("**/api/auth/sign-in/social", (route) =>
      route.fulfill({ json: { url: "/login?mock=github", redirect: false } }),
    );
    const request = page.waitForRequest((r) => r.url().includes("/api/auth/sign-in/social"));
    await page.getByRole("button", { name: /Continuer avec GitHub/ }).click();
    expect((await request).postDataJSON()).toMatchObject({
      provider: "github",
      callbackURL: `/accept-invitation/${id}`,
    });
  });

  test("C3.b un next hostile est ignoré (callbackURL = /projects)", async ({ page }) => {
    await page.goto(`/login?next=${encodeURIComponent("//evil.com")}`);
    await page.route("**/api/auth/sign-in/social", (route) =>
      route.fulfill({ json: { url: "/login?mock=github", redirect: false } }),
    );
    const request = page.waitForRequest((r) => r.url().includes("/api/auth/sign-in/social"));
    await page.getByRole("button", { name: /Continuer avec GitHub/ }).click();
    expect((await request).postDataJSON()).toMatchObject({ callbackURL: "/projects" });
  });

  test("C3.d un connecté sans organisation active n'est pas renvoyé vers /organizations", async ({
    page,
    baseURL,
  }) => {
    const { id } = await invitedUser(page, baseURL);
    await open(page, id);
    await expect(page).toHaveURL(new RegExp(`/accept-invitation/${id}$`));
  });
});

test.describe("C4 : fuites et en-têtes", () => {
  test("C4.d/C4.e aucun journal navigateur avec l'id, titre fixe, noindex, no-store, aucun lien sortant", async ({
    page,
    baseURL,
  }) => {
    const { id } = await invitedUser(page, baseURL);
    const logs: string[] = [];
    page.on("console", (message) => logs.push(message.text()));
    page.on("pageerror", (error) => logs.push(error.message));
    const response = await open(page, id);
    await expect(page.getByRole("heading", { level: 1, name: /^Rejoindre / })).toBeVisible();
    expect(response?.headers()["cache-control"]).toContain("no-store");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    await expect(page).toHaveTitle("Invitation – Koklo");
    expect(logs.join("\n")).not.toContain(id);
    const hrefs = await page
      .locator("a[href]")
      .evaluateAll((a) => a.map((x) => x.getAttribute("href")));
    for (const href of hrefs) expect(href).toMatch(/^\/(?!\/)/);
    // Texte visible (innerText) : le flux RSC de Next embarque l'id dans des <script>, hors rendu.
    expect(await page.locator("body").innerText()).not.toContain(id);
  });
});

test.describe("C7 : axe WCAG AA sur chaque état, clair et sombre", () => {
  const scan = async (page: Page) =>
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze())
      .violations;

  for (const theme of ["light", "dark"] as const) {
    test(`états prêt, invalide et autre adresse (${theme})`, async ({ page, baseURL }) => {
      const { id } = await invitedUser(page, baseURL);
      const stranger = uniqueEmail("etranger");
      const foreignId = await insertInvitation({ email: stranger });

      const go = async (target: string) => {
        await open(page, target);
        await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
        // Le thème choisi persiste (localStorage) : on ne bascule que la première fois.
        const alreadyDark = await page
          .locator("html")
          .evaluate((el) => el.classList.contains("dark"));
        if (theme === "dark" && !alreadyDark) {
          await page.getByRole("button", { name: "Passer au thème sombre" }).first().click();
          await expect(page.locator("html")).toHaveClass(/dark/);
        }
      };

      await go(id);
      await expect(page.getByRole("heading", { level: 1, name: /^Rejoindre / })).toBeVisible();
      expect(await scan(page)).toEqual([]);

      await go(foreignId);
      await expect(alertOf(page)).toBeVisible();
      expect(await scan(page)).toEqual([]);

      await go(randomUUID());
      await expect(page.getByRole("heading", { level: 1, name: INVALID_TITLE })).toBeVisible();
      expect(await scan(page)).toEqual([]);
    });
  }

  test("sous 768 px : bouton principal d'au moins 44 px", async ({ page, baseURL }) => {
    const { id } = await invitedUser(page, baseURL);
    await page.setViewportSize({ width: 390, height: 800 });
    await open(page, id);
    const box = await page.getByRole("button", { name: "Accepter l'invitation" }).boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  });
});

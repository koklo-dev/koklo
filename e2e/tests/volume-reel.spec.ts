import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { type APIRequestContext, expect, type Page, test } from "@playwright/test";
import {
  insertMembership,
  insertSession,
  insertUser,
  SESSION_COOKIE,
  withClient,
} from "../support/db.ts";
import { apiAs, ORPC, type R2Member } from "../support/r2-workspace.ts";
import { SEED } from "../support/session.ts";

/**
 * Volume réel sur la vraie pile (TK-105 lot C, B368) : `pnpm seed:planche` charge la planche (248 fonctionnalités,
 * 86 règles, 18 parcours, 3 rôles, 355 propositions) dans l'organisation de démo ; l'équipe et le client la lisent par
 * l'API de production. Vérifie aussi les critères 9 et 13 de TK-104 : vue client en volume, axe après décision.
 */
const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const PLANCHE_PROJECT = "01900000-0000-7000-8000-0000000000b2";
const PATH = `/projects/${PLANCHE_PROJECT}/spec/functional`;
const ROOT = resolve(import.meta.dirname, "../..");
let baseURL: string;
let admin: R2Member;
let client: R2Member;

test.beforeAll(async () => {
  execFileSync("pnpm", ["seed:planche"], { cwd: ROOT, stdio: "inherit", env: process.env });
  await withClient(async (db) => {
    const adminSession = await insertSession(db, SEED.adminUser, SEED.organization);
    admin = { userId: SEED.adminUser, role: "owner", memberId: "", cookie: adminSession };
    const userId = await insertUser(db, {
      email: `volume-client-${Date.now()}@example.com`,
      name: "Client volume",
    });
    const memberId = await insertMembership(db, SEED.organization, userId, "client");
    client = {
      userId,
      role: "client",
      memberId,
      cookie: await insertSession(db, userId, SEED.organization),
    };
  });
  const api = await apiAs(process.env.E2E_WEB_URL ?? "http://127.0.0.1:3100", admin);
  const linked = await api.post(`${ORPC}/projects/${PLANCHE_PROJECT}/clients`, {
    data: { memberId: client.memberId },
  });
  expect([200, 201, 409]).toContain(linked.status());
  await api.dispose();
});

test.beforeEach(({ baseURL: url }) => {
  baseURL = url as string;
});

async function signIn(page: Page, member: R2Member): Promise<void> {
  await page.context().addCookies([{ name: SESSION_COOKIE, value: member.cookie, url: baseURL }]);
}

async function axeClean(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(results.violations, JSON.stringify(results.violations.map((v) => v.id))).toEqual([]);
}

const pendingProposals = (): Promise<number> =>
  withClient(async (db) =>
    Number(
      (
        await db.query<{ n: string }>(
          "SELECT count(*) AS n FROM agent_proposals WHERE project_id = $1 AND status = 'pending'",
          [PLANCHE_PROJECT],
        )
      ).rows[0]?.n,
    ),
  );

async function expectForbidden(api: APIRequestContext, path: string): Promise<void> {
  expect((await api.get(`${ORPC}${path}`)).status()).toBe(403);
}

test("équipe : 248 fonctionnalités, 50 chargées, recherche hors de la page, lien direct F-200", async ({
  page,
}) => {
  await signIn(page, admin);
  await page.goto(PATH);
  await expect(page.locator("[data-slot='count-bar']")).toContainText(
    "248 fonctionnalités · 50 chargées",
  );
  await axeClean(page);
  await page.goto(`${PATH}?q=F-200`);
  await expect(page.locator("[data-row-key='F-200']")).toBeVisible();
  await page.goto(`${PATH}?sel=F-200`);
  await expect(
    page.getByRole("complementary", { name: "Fiche de la fonctionnalité" }),
  ).toBeVisible();
  await expect(page.locator("[data-row-key='F-200']")).toHaveAttribute("aria-current", "true", {
    timeout: 10_000,
  });
});

test("équipe : relecture groupée, « Accepter les N » ne touche que son groupe, axe après décision", async ({
  page,
}) => {
  await signIn(page, admin);
  await page.goto(`${PATH}?view=review`);
  const review = page.getByRole("region", { name: "Relecture des propositions" });
  await expect(review).toBeVisible();
  await expect(review.getByText(/À relire · 355/)).toBeVisible();
  expect(await review.locator("li").count()).toBeLessThan(300);
  await axeClean(page);
  const before = await pendingProposals();
  const accept = review.getByRole("button", { name: /^Accepter les \d+ restantes? de / }).first();
  const label = (await accept.getAttribute("aria-label")) ?? "";
  const group = Number(/Accepter les (\d+)/.exec(label)?.[1]);
  expect(group).toBeGreaterThan(0);
  expect(group).toBeLessThan(before);
  await accept.click();
  await expect(review.getByRole("status")).toContainText(/propositions? acceptées? dans/);
  await expect.poll(pendingProposals).toBe(before - group);
  await axeClean(page);
});

test("client : vue du cahier en volume, totaux réels, recherche de règle sur tout l'index, axe", async ({
  page,
}) => {
  await signIn(page, client);
  await page.goto(`${PATH}?tab=features`);
  await expect(page.getByText(/248 fonctionnalités/).first()).toBeVisible();
  await expect(page.getByText(/50 chargées/).first()).toBeVisible();
  await axeClean(page);
  await page.goto(`${PATH}?tab=rules`);
  await page.getByRole("searchbox", { name: "Rechercher une règle" }).fill("R-080");
  await expect(page.getByText("R-080", { exact: true })).toBeVisible();
  await axeClean(page);
});

test("droits : le client reçoit 403 sur spec.*, proposal.list et la matrice des rôles", async () => {
  const api = await apiAs(baseURL, client);
  await expectForbidden(api, `/projects/${PLANCHE_PROJECT}/spec/functional?tab=rules`);
  await expectForbidden(api, `/projects/${PLANCHE_PROJECT}/spec/roles/matrix`);
  await expectForbidden(api, `/projects/${PLANCHE_PROJECT}/proposals`);
  await api.dispose();
});

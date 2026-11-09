import AxeBuilder from "@axe-core/playwright";
import { type APIRequestContext, expect, type Page, test } from "@playwright/test";
import {
  apiAs,
  createProjectWithSpecRepo,
  createR2Workspace,
  linkClientToProject,
  ORPC,
  type R2Member,
  type R2Workspace,
  SESSION_COOKIE,
} from "../support/r2-workspace.ts";

/**
 * TK-92 : la vue d'ensemble de bout en bout contre la vraie pile (API, worker avec le faux fournisseur Git, web,
 * Postgres) : projet neuf, passage au cadrage, client lié (vue client sans SHA), client non lié (404 uniforme).
 */
const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

let baseURL: string;
test.beforeEach(({ baseURL: url }) => {
  baseURL = url as string;
});

interface Space {
  workspace: R2Workspace;
  owner: APIRequestContext;
  projectId: string;
}

async function space(): Promise<Space> {
  const workspace = await createR2Workspace();
  const owner = await apiAs(baseURL, workspace.owner);
  const { projectId } = await createProjectWithSpecRepo(owner, workspace, "Portail de réservation");
  return { workspace, owner, projectId };
}

async function signIn(page: Page, member: R2Member) {
  await page.context().addCookies([{ name: SESSION_COOKIE, value: member.cookie, url: baseURL }]);
}

const heading = (page: Page) => page.getByRole("heading", { level: 1, name: "Vue d'ensemble" });
const violations = async (page: Page) =>
  (await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze()).violations;

/** Rend stables les pages requises du dossier d'idée (seuil du passage au cadrage). */
async function makeRequiredStable(owner: APIRequestContext, projectId: string): Promise<void> {
  const listed = (await (await owner.get(`${ORPC}/projects/${projectId}/idea/pages`)).json()) as {
    pages: Array<{ id: string; required: boolean }>;
  };
  for (const page of listed.pages.filter((p) => p.required)) {
    const detail = (await (
      await owner.get(`${ORPC}/projects/${projectId}/idea/pages/${page.id}`)
    ).json()) as { version: number };
    const written = await owner.put(`${ORPC}/projects/${projectId}/idea/pages/${page.id}/content`, {
      data: { baseVersion: detail.version, contentMd: "Contenu de la page.\n" },
    });
    expect(written.ok(), await written.text()).toBe(true);
    const done = await owner.post(`${ORPC}/projects/${projectId}/idea/pages/${page.id}/status`, {
      data: { status: "stable" },
    });
    expect(done.ok(), await done.text()).toBe(true);
  }
}

const overviewOf = async (api: APIRequestContext, projectId: string) =>
  (await (await api.get(`${ORPC}/projects/${projectId}/overview`)).json()) as {
    phase: string;
    audience: string;
    canInvite: boolean;
  };

test("équipe : projet neuf en phase Idée, puis phase Cadrage après « Passer au cadrage »", async ({
  page,
}) => {
  const { workspace, owner, projectId } = await space();
  await signIn(page, workspace.owner);
  await page.goto(`/projects/${projectId}`);
  await expect(heading(page)).toBeVisible();
  await expect(
    page.getByRole("list", { name: "Phase du projet" }).getByRole("listitem").first(),
  ).toHaveAttribute("aria-current", "step");
  await expect(page.getByRole("note", { name: "Prochaine étape" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Inviter" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Activité" })).toBeVisible();
  expect(await violations(page)).toEqual([]);

  await makeRequiredStable(owner, projectId);
  const frozen = await owner.post(`${ORPC}/projects/${projectId}/idea/freeze`, {
    data: { idempotencyKey: "overview-e2e-freeze" },
  });
  expect(frozen.ok(), await frozen.text()).toBe(true);
  await expect
    .poll(async () => (await overviewOf(owner, projectId)).phase, { timeout: 60_000 })
    .toBe("framing");

  await page.reload();
  await expect(page.getByRole("region", { name: "Livrables du cadrage" })).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Livrables du cadrage" }).getByRole("link"),
  ).toHaveCount(1);
  await expect(page.getByText("Bientôt disponible")).toHaveCount(6);
  expect(await violations(page)).toEqual([]);
  await page.getByRole("link", { name: /Voir toute l'activité/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Activité" })).toBeVisible();
  expect(await violations(page)).toEqual([]);
});

test("client lié : vue client, sans « Inviter » ni SHA ; client non lié : 404 uniforme", async ({
  page,
}) => {
  const { workspace, owner, projectId } = await space();
  await linkClientToProject(owner, projectId, workspace.client);
  const client = await apiAs(baseURL, workspace.client);
  const view = await overviewOf(client, projectId);
  expect(view).toMatchObject({ audience: "client", canInvite: false });
  await signIn(page, workspace.client);
  await page.goto(`/projects/${projectId}`);
  await expect(heading(page)).toBeVisible();
  await expect(page.getByRole("link", { name: "Inviter" })).toHaveCount(0);
  await expect(page.locator("main")).not.toContainText(/\b[0-9a-f]{7,40}\b/);
  expect(await violations(page)).toEqual([]);

  const other = await space();
  const refused = await client.get(`${ORPC}/projects/${other.projectId}/overview`);
  expect(refused.status()).toBe(404);
  expect((await client.get(`${ORPC}/projects/${other.projectId}/activity`)).status()).toBe(404);
  await page.goto(`/projects/${other.projectId}`);
  await expect(page.getByRole("heading", { name: "Projet introuvable" })).toBeVisible();
});

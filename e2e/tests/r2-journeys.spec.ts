import { randomUUID } from "node:crypto";
import { type APIRequestContext, expect, type Page, test } from "@playwright/test";
import { withClient } from "../support/db.ts";
import {
  apiAs,
  createProjectWithSpecRepo,
  createR2Workspace,
  ORPC,
  type R2Member,
  type R2Workspace,
  SESSION_COOKIE,
  type SpecRepo,
} from "../support/r2-workspace.ts";
import { postSignedPush, waitForDeliveryProcessed, waitForSpecHead } from "../support/webhook.ts";

/**
 * Résultat R2 (vision §21) de bout en bout contre la vraie pile API + worker + web + Postgres, avec le
 * faux fournisseur Git injecté par le lanceur (ADR 0010) : créer un projet crée le dépôt de spec ; écrire
 * une fonctionnalité dans l'app devient un commit. Le faux n'émet aucun webhook : les tests postent des
 * `push` signés. Chaque test crée son espace (organisation, projet, installation) : aucun ordre requis.
 */
const SHA = /^[0-9a-f]{40}$/;
let baseURL: string;

test.beforeEach(({ baseURL: url }) => {
  baseURL = url as string;
});

async function signIn(page: Page, member: R2Member): Promise<void> {
  await page.context().addCookies([{ name: SESSION_COOKIE, value: member.cookie, url: baseURL }]);
}

async function json<T>(response: Awaited<ReturnType<APIRequestContext["get"]>>): Promise<T> {
  const body = await response.text();
  expect(response.ok(), `${response.status()} ${body}`).toBe(true);
  return JSON.parse(body) as T;
}

interface Batch {
  id: string;
  status: string;
  commitSha: string | null;
  results: { specId: string | null; kind: string }[];
}

const slugOf = (n: string): string => `${n}-${randomUUID().slice(0, 8)}`;
const featuresPath = (projectId: string): string => `/projects/${projectId}/features`;
const pushTo = (
  api: APIRequestContext,
  workspace: R2Workspace,
  repositoryId: number,
  after?: string,
) =>
  postSignedPush(api, {
    installationId: workspace.installation.externalId,
    repositoryId,
    ...(after ? { after } : {}),
  });

async function submitFeature(
  api: APIRequestContext,
  projectId: string,
  title: string,
): Promise<Batch> {
  const submitted = await json<Batch>(
    await api.post(`${ORPC}/projects/${projectId}/spec/batches`, {
      data: {
        idempotencyKey: `e2e-${randomUUID()}`,
        operations: [{ kind: "feature.create", title, priority: "must" }],
      },
    }),
  );
  let batch = submitted;
  await expect
    .poll(
      async () => {
        batch = await json<Batch>(
          await api.get(`${ORPC}/projects/${projectId}/spec/batches/${submitted.id}`),
        );
        return batch.status;
      },
      { timeout: 15_000, intervals: [250, 500, 1000] },
    )
    .toBe("committed");
  return batch;
}

async function pushAndIndex(
  api: APIRequestContext,
  workspace: R2Workspace,
  repositoryId: number,
  projectId: string,
  sha: string,
): Promise<void> {
  const { response, deliveryId } = await pushTo(api, workspace, repositoryId, sha);
  expect(response.status()).toBe(202);
  await waitForDeliveryProcessed(deliveryId);
  await waitForSpecHead(api, projectId, sha);
}

test("T1 créer un projet depuis l'UI crée le dépôt de spec", async ({ page }) => {
  const workspace = await createR2Workspace();
  const name = slugOf("Projet R2");
  await signIn(page, workspace.owner);
  await page.goto("/projects");
  await page.getByTestId("create-project-button").click();
  const dialog = page.getByRole("dialog", { name: "Créer un projet" });
  await expect(dialog).toContainText(`Compte GitHub : ${workspace.slug}`);
  await dialog.getByLabel("Nom du projet").fill(name);
  await dialog.getByRole("button", { name: "Créer le projet" }).click();

  // Succès complet : le panneau se ferme (les étapes « Terminé » n'y sont plus visibles) et une région d'état l'annonce.
  await expect(dialog).toBeHidden();
  await expect(
    page.getByRole("status").filter({ hasText: `Projet « ${name} » et dépôt de spec créés.` }),
  ).toBeVisible();

  const owner = await apiAs(baseURL, workspace.owner);
  const projects = await json<{ id: string; name: string }[]>(await owner.get(`${ORPC}/projects`));
  const project = projects.find((candidate) => candidate.name === name);
  expect(project).toBeDefined();
  const projectId = (project as { id: string }).id;

  const repos = await json<SpecRepo[]>(await owner.get(`${ORPC}/projects/${projectId}/repos`));
  expect(repos).toHaveLength(1);
  expect(repos[0]).toMatchObject({ role: "spec", mode: "new", ownerLogin: workspace.slug });
  const rows = await withClient(
    async (client) =>
      (
        await client.query("SELECT external_id FROM project_repos WHERE project_id = $1", [
          projectId,
        ])
      ).rows,
  );
  expect(rows).toHaveLength(1);

  const again = await owner.post(`${ORPC}/projects/${projectId}/spec-repo`, {
    data: { installationId: workspace.installation.id },
  });
  expect(again.status()).toBe(409);
  await owner.dispose();
});

test("T2 le push de la branche cadrage construit l'index de la spec", async ({ page }) => {
  const workspace = await createR2Workspace();
  const owner = await apiAs(baseURL, workspace.owner);
  const { projectId, repoExternalId } = await createProjectWithSpecRepo(
    owner,
    workspace,
    slugOf("Index"),
  );
  await signIn(page, workspace.owner);

  await page.goto(featuresPath(projectId));
  await expect(
    page.getByRole("heading", { name: "La spec est en cours de préparation" }),
  ).toBeVisible();

  const { response, deliveryId } = await pushTo(owner, workspace, repoExternalId);
  expect(response.status()).toBe(202);
  await waitForDeliveryProcessed(deliveryId);
  const sha = await waitForSpecHead(owner, projectId);
  expect(sha).toMatch(SHA);

  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Aucune fonctionnalité pour le moment" }),
  ).toBeVisible();
  await owner.dispose();
});

test("T3 webhook : mauvaise signature 401, rejeu du même delivery id sans second traitement", async () => {
  const workspace = await createR2Workspace();
  const owner = await apiAs(baseURL, workspace.owner);
  const { projectId, repoExternalId } = await createProjectWithSpecRepo(
    owner,
    workspace,
    slugOf("Webhook"),
  );
  const options = {
    installationId: workspace.installation.externalId,
    repositoryId: repoExternalId,
  };
  const rowsFor = (deliveryId: string) =>
    withClient(async (client) =>
      Number(
        (
          await client.query<{ n: string }>(
            "SELECT count(*) AS n FROM webhook_deliveries WHERE delivery_id = $1",
            [deliveryId],
          )
        ).rows[0]?.n,
      ),
    );

  const forged = await postSignedPush(owner, { ...options, secret: "mauvais-secret-e2e" });
  expect(forged.response.status()).toBe(401);
  expect(await rowsFor(forged.deliveryId)).toBe(0);

  const deliveryId = randomUUID();
  expect((await postSignedPush(owner, { ...options, deliveryId })).response.status()).toBe(202);
  await waitForDeliveryProcessed(deliveryId);
  expect((await postSignedPush(owner, { ...options, deliveryId })).response.status()).toBe(202);
  expect(await rowsFor(deliveryId)).toBe(1);
  await waitForSpecHead(owner, projectId);
  await owner.dispose();
});

async function fillFeatureForm(page: Page, title: string): Promise<void> {
  await page.getByRole("button", { name: "Nouvelle fonctionnalité" }).first().click();
  const form = page.getByRole("dialog");
  await form.getByRole("textbox", { name: "Titre (obligatoire)" }).fill(title);
  await form.getByRole("combobox", { name: "Priorité (obligatoire)" }).click();
  await page.getByRole("option", { name: "Indispensable", exact: true }).click();
  await form.getByRole("button", { name: "Enregistrer" }).click();
}

interface ReadyProject {
  workspace: R2Workspace;
  owner: APIRequestContext;
  projectId: string;
  repositoryId: number;
}

/** Projet avec dépôt de spec et index initial prêt (le faux n'émet pas de push après la création). */
async function readyProject(label: string): Promise<ReadyProject> {
  const workspace = await createR2Workspace();
  const owner = await apiAs(baseURL, workspace.owner);
  const { projectId, repoExternalId: repositoryId } = await createProjectWithSpecRepo(
    owner,
    workspace,
    slugOf(label),
  );
  const initial = await pushTo(owner, workspace, repositoryId);
  await waitForDeliveryProcessed(initial.deliveryId);
  await waitForSpecHead(owner, projectId);
  return { workspace, owner, projectId, repositoryId };
}

/** Écrit une fonctionnalité par le formulaire, attend le lot n° `rank` (1, 2…) et le renvoie. */
async function writeFromUi(
  page: Page,
  { owner, projectId }: ReadyProject,
  title: string,
  rank: number,
): Promise<Batch> {
  await page.goto(featuresPath(projectId));
  await fillFeatureForm(page, title);
  let batchId: string | undefined;
  await expect
    .poll(
      async () => {
        const { rows } = await withClient((client) =>
          client.query<{ id: string; status: string }>(
            "SELECT id, status FROM spec_write_batches WHERE project_id = $1 ORDER BY enqueued_at",
            [projectId],
          ),
        );
        batchId = rows[rank - 1]?.id;
        return rows[rank - 1]?.status;
      },
      { timeout: 15_000, intervals: [250, 500, 1000] },
    )
    .toBe("committed");
  return json<Batch>(await owner.get(`${ORPC}/projects/${projectId}/spec/batches/${batchId}`));
}

const featureItems = async (project: ReadyProject) =>
  (
    await json<{ items: { specId: string; title: string }[] }>(
      await project.owner.get(`${ORPC}/projects/${project.projectId}/spec/features`),
    )
  ).items;

test("T4 écrire une fonctionnalité depuis l'UI donne un lot committed avec un commit", async ({
  page,
}) => {
  const project = await readyProject("Ecriture");
  await signIn(page, project.workspace.owner);
  const batch = await writeFromUi(page, project, slugOf("Notifications"), 1);
  expect(batch.status).toBe("committed");
  expect(batch.commitSha).toMatch(SHA);
  expect(batch.results[0]?.specId).toBe("F-001");
  await project.owner.dispose();
});

test("T5 le push suivant remet l'index à jour avec le commit du lot", async ({ page }) => {
  const project = await readyProject("Index suivant");
  await signIn(page, project.workspace.owner);
  const title = slugOf("Notifications");
  const batch = await writeFromUi(page, project, title, 1);
  await pushAndIndex(
    project.owner,
    project.workspace,
    project.repositoryId,
    project.projectId,
    batch.commitSha as string,
  );
  const head = await json<{ commitSha: string }>(
    await project.owner.get(`${ORPC}/projects/${project.projectId}/spec`),
  );
  expect(head.commitSha).toBe(batch.commitSha);
  expect(await featureItems(project)).toEqual([
    expect.objectContaining({ specId: "F-001", title }),
  ]);
  // Preuve indirecte du commit : l'index relit les fichiers du dépôt, le titre en vient.
  await page.goto(featuresPath(project.projectId));
  await expect(page.getByRole("link", { name: title })).toBeVisible();
  await project.owner.dispose();
});

test("T6 deux écritures donnent deux commits distincts et ordonnés", async ({ page }) => {
  const project = await readyProject("Deux ecritures");
  await signIn(page, project.workspace.owner);
  const first = await writeFromUi(page, project, slugOf("Premiere"), 1);
  const second = await writeFromUi(page, project, slugOf("Seconde"), 2);
  expect(first.commitSha).toMatch(SHA);
  expect(second.commitSha).toMatch(SHA);
  expect(second.commitSha).not.toBe(first.commitSha);
  expect([first.results[0]?.specId, second.results[0]?.specId]).toEqual(["F-001", "F-002"]);
  await pushAndIndex(
    project.owner,
    project.workspace,
    project.repositoryId,
    project.projectId,
    second.commitSha as string,
  );
  expect((await featureItems(project)).map((item) => item.specId).sort()).toEqual([
    "F-001",
    "F-002",
  ]);
  await project.owner.dispose();
});

test("T7 un rôle en lecture seule ne voit pas le formulaire et reçoit 403 à l'écriture", async ({
  page,
}) => {
  const workspace = await createR2Workspace();
  const owner = await apiAs(baseURL, workspace.owner);
  const { projectId, repoExternalId } = await createProjectWithSpecRepo(
    owner,
    workspace,
    slugOf("Roles"),
  );
  const initial = await pushTo(owner, workspace, repoExternalId);
  await waitForDeliveryProcessed(initial.deliveryId);
  await waitForSpecHead(owner, projectId);

  const reader = await apiAs(baseURL, workspace.client);
  const denied = await reader.post(`${ORPC}/projects/${projectId}/spec/batches`, {
    data: {
      idempotencyKey: `e2e-${randomUUID()}`,
      operations: [{ kind: "feature.create", title: "Interdit", priority: "must" }],
    },
  });
  expect(denied.status()).toBe(403);

  await signIn(page, workspace.client);
  await page.goto(featuresPath(projectId));
  await expect(
    page.getByRole("heading", { name: "Aucune fonctionnalité pour le moment" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Nouvelle fonctionnalité" })).toHaveCount(0);

  // L'équipe (dev) écrit : le même appel passe.
  const dev = await apiAs(baseURL, workspace.dev);
  await submitFeature(dev, projectId, "Autorisé");
  await Promise.all([reader.dispose(), dev.dispose(), owner.dispose()]);
});

test("T8 installer l'App par OAuth factice relie le compte, le rejeu est refusé", async ({
  page,
}) => {
  const workspace = await createR2Workspace();
  const owner = await apiAs(baseURL, workspace.owner);
  const start = await json<{ url: string }>(
    await owner.post(`${ORPC}/provider/installations/start`, { data: {} }),
  );
  const state = new URL(start.url).searchParams.get("state");
  expect(state).toBeTruthy();

  // Pool du lanceur : e2e-link-1 -> installation 9100001 (organisation GitHub e2e-link-org-1), usage unique.
  const callback = `/api/github/callback?${new URLSearchParams({
    installation_id: "9100001",
    state: state as string,
    code: "fake-code-e2e-link-1",
    setup_action: "install",
  })}`;
  const done = await owner.get(callback, { maxRedirects: 0 });
  expect(done.status()).toBe(303);
  expect(
    new URL(done.headers().location as string, baseURL).pathname +
      new URL(done.headers().location as string, baseURL).search,
  ).toBe("/github?result=installed");

  await signIn(page, workspace.owner);
  await page.goto("/github?result=installed");
  await expect(page.getByText("Application GitHub installée")).toBeVisible();
  await expect(page.getByRole("heading", { name: "e2e-link-org-1" })).toBeVisible();

  const replay = await owner.get(callback, { maxRedirects: 0 });
  expect(replay.status()).toBe(303);
  expect(replay.headers().location).toContain("result=invalid_state");
  const linked = await withClient(async (client) =>
    Number(
      (
        await client.query<{ n: string }>(
          "SELECT count(*) AS n FROM provider_installations WHERE external_id = '9100001'",
        )
      ).rows[0]?.n,
    ),
  );
  expect(linked).toBe(1);
  await owner.dispose();
});

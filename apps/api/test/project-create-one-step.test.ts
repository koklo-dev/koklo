import { randomUUID } from "node:crypto";
import type { TestDatabase } from "@koklo/db/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createSeededDatabase } from "./helpers/app.ts";
import { type ClientScene, createClientScene } from "./helpers/client-scene.ts";
import { type CreationApp, createCreationApp } from "./helpers/project-creation.ts";
import { insertInstallation } from "./helpers/repos.ts";
import { send } from "./helpers/tickets.ts";

/**
 * TK-93 lot A (cas 5, 7, 8) : création de projet en une étape, état de la création, relance du dépôt
 * et données en UE, sur base réelle. La file du worker et l'invitation sont espionnées.
 */
let database: TestDatabase;
let harness: CreationApp;
let scene: ClientScene;

beforeAll(async () => {
  database = await createSeededDatabase();
  harness = await createCreationApp(database.url);
  scene = await createClientScene(database);
}, 180_000);
afterAll(async () => {
  await harness?.app.close();
  await database?.dispose();
});
beforeEach(() => {
  harness.queue.jobs = [];
  harness.invitations.calls = [];
});

const as = (role: keyof ClientScene["staff"]) => scene.staff[role].cookie;
const create = (cookie: string, body: Record<string, unknown>) =>
  send(harness.app, cookie, "post", "/projects", body);
const countProjects = async () =>
  Number(
    (
      await database.query<{ n: string }>(
        "SELECT count(*)::text AS n FROM projects WHERE organization_id = $1",
        [scene.organizationId],
      )
    )[0]?.n,
  );
const creationRows = (projectId: string) =>
  database.query<{
    id: string;
    status: string;
    error_code: string | null;
    repo_name: string;
    installation_id: string | null;
    idea_template: string;
    requested_by: string;
  }>(
    `SELECT id, status, error_code, repo_name, installation_id, idea_template, requested_by
       FROM project_creations WHERE project_id = $1 ORDER BY created_at, id`,
    [projectId],
  );
const pageCount = async (projectId: string) =>
  Number(
    (
      await database.query<{ n: string }>(
        "SELECT count(*)::text AS n FROM idea_pages WHERE project_id = $1",
        [projectId],
      )
    )[0]?.n,
  );
const audit = (action: string, projectId?: string) =>
  database.query<{ actor_id: string; target_id: string; project_id: string | null }>(
    `SELECT actor_id, target_id, project_id FROM audit_log
      WHERE organization_id = $1 AND action = $2 AND ($3::uuid IS NULL OR target_id = $3)`,
    [scene.organizationId, action, projectId ?? null],
  );
const install = (over = {}) => insertInstallation(database, scene.organizationId, over);

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même route, un test par cas
describe("TK-93 project.create : création atomique", () => {
  it("le nom seul reste valide : projet, 10 pages, création sautée (aucun compte), aucun job", async () => {
    const res = await create(as("owner"), { name: "Atelier neuf" });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toEqual({ id: expect.any(String), name: "Atelier neuf" });
    expect(await pageCount(res.body.id)).toBe(10);
    const [row] = await creationRows(res.body.id);
    expect(row).toMatchObject({
      status: "skipped",
      error_code: "no_account",
      idea_template: "default",
    });
    expect(row?.requested_by).toBe(scene.staff.owner.userId);
    expect(harness.queue.jobs).toEqual([]);
    expect((await send(harness.app, as("dev"), "get", "/projects")).body).toContainEqual(res.body);
    expect(await audit("project.create", res.body.id)).toHaveLength(1);
  });

  it("avec un compte GitHub : ligne pending, nom de dépôt dérivé, un seul job { id }", async () => {
    const installation = await install();
    const res = await create(as("admin"), {
      name: "Portail de réservation",
      installationId: installation.id,
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const [row] = await creationRows(res.body.id);
    expect(row).toMatchObject({
      status: "pending",
      error_code: null,
      repo_name: "portail-de-reservation-spec",
      installation_id: installation.id,
    });
    expect(harness.queue.jobs).toEqual([{ id: row?.id, creationId: row?.id }]);
  });

  it("gabarit vide : les 4 pages requises seulement ; UE enregistrée ; nom de dépôt choisi", async () => {
    const installation = await install();
    const res = await create(as("owner"), {
      name: "Atelier vide",
      ideaTemplate: "empty",
      euOnly: true,
      repoName: "mon-depot_v2",
      installationId: installation.id,
    });
    expect(await pageCount(res.body.id)).toBe(4);
    const pages = await database.query<{ required: boolean }>(
      "SELECT required FROM idea_pages WHERE project_id = $1",
      [res.body.id],
    );
    expect(pages.every((page) => page.required)).toBe(true);
    const [project] = await database.query<{ eu_only: boolean }>(
      "SELECT eu_only FROM projects WHERE id = $1",
      [res.body.id],
    );
    expect(project?.eu_only).toBe(true);
    expect((await creationRows(res.body.id))[0]).toMatchObject({
      repo_name: "mon-depot_v2",
      idea_template: "empty",
    });
  });

  it("par défaut les données ne sont pas restreintes à l'UE", async () => {
    const res = await create(as("owner"), { name: "Sans UE" });
    const [project] = await database.query<{ eu_only: boolean }>(
      "SELECT eu_only FROM projects WHERE id = $1",
      [res.body.id],
    );
    expect(project?.eu_only).toBe(false);
  });

  it("nom de dépôt invalide, compte inconnu, suspendu ou d'une autre organisation : 422, rien n'est créé", async () => {
    const before = await countProjects();
    const suspended = await install({ status: "suspended" });
    const foreign = await insertInstallation(database, scene.foreign.organizationId);
    const bodies = [
      { name: "A", repoName: ".." },
      { name: "B", repoName: "a b" },
      { name: "C", installationId: randomUUID() },
      { name: "D", installationId: suspended.id },
      { name: "E", installationId: foreign.id },
    ];
    for (const body of bodies) {
      const res = await create(as("owner"), body);
      expect(res.status, JSON.stringify(body)).toBe(422);
      expect(res.body.code).toBe("VALIDATION");
    }
    expect(await countProjects()).toBe(before);
  });

  it("idempotence : même clé, même projet, une seule ligne et un seul job", async () => {
    const installation = await install();
    const body = { name: "Rejeu", installationId: installation.id, idempotencyKey: "cle-rejeu-1" };
    const first = await create(as("owner"), body);
    const second = await create(as("owner"), body);
    expect(second.status).toBe(200);
    expect(second.body).toEqual(first.body);
    expect(await creationRows(first.body.id)).toHaveLength(1);
    expect(harness.queue.jobs).toHaveLength(1);
    const other = await create(as("owner"), { ...body, idempotencyKey: "cle-rejeu-2" });
    expect(other.body.id).not.toBe(first.body.id);
  });

  it("deux requêtes simultanées de même clé : un seul projet", async () => {
    const body = { name: "Course", idempotencyKey: "cle-course" };
    const [a, b] = await Promise.all([create(as("owner"), body), create(as("admin"), body)]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(a.body.id).toBe(b.body.id);
    expect(await creationRows(a.body.id)).toHaveLength(1);
  });

  it("tout ou rien : si la ligne de création échoue, ni projet ni pages ni audit", async () => {
    await database.query(
      `CREATE OR REPLACE FUNCTION creations_fail() RETURNS trigger AS $$
       BEGIN RAISE EXCEPTION 'échec simulé'; END; $$ LANGUAGE plpgsql`,
    );
    await database.query(
      "CREATE TRIGGER creations_fail BEFORE INSERT ON project_creations FOR EACH ROW EXECUTE FUNCTION creations_fail()",
    );
    const before = await countProjects();
    const audits = (await audit("project.create")).length;
    try {
      const res = await create(as("owner"), { name: "Voué à l'échec" });
      expect(res.status).toBe(500);
    } finally {
      await database.query("DROP TRIGGER creations_fail ON project_creations");
    }
    expect(await countProjects()).toBe(before);
    expect((await audit("project.create")).length).toBe(audits);
  });

  it("la file refuse la création : projet gardé, ligne en échec provider_unavailable (relançable)", async () => {
    const installation = await install();
    harness.queue.failNext = true;
    const res = await create(as("owner"), { name: "File HS", installationId: installation.id });
    expect(res.status).toBe(200);
    expect((await creationRows(res.body.id))[0]).toMatchObject({
      status: "failed",
      error_code: "provider_unavailable",
    });
  });

  it("owner et admin seulement : dev, designer, client et business reçoivent 403, rien n'est créé", async () => {
    const before = await countProjects();
    for (const cookie of [as("dev"), as("designer"), as("business"), scene.c1.cookie]) {
      expect((await create(cookie, { name: "Refusé" })).status).toBe(403);
    }
    expect(await countProjects()).toBe(before);
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'un même flux, un test par cas
describe("TK-93 project.create : client invité (B303)", () => {
  it("l'invitation est demandée pour le rôle client et le projet créé", async () => {
    const res = await create(as("owner"), { name: "Avec client", clientEmail: "marie@exemple.fr" });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(harness.invitations.calls).toEqual([
      { email: "marie@exemple.fr", role: "client", projectIds: [res.body.id] },
    ]);
  });

  it("adresse d'un membre d'un autre rôle que client : 422 sur clientEmail, rien n'est créé", async () => {
    const before = await countProjects();
    const res = await create(as("owner"), { name: "Doublon", clientEmail: scene.staff.dev.email });
    expect(res.status).toBe(422);
    expect(res.body.data).toMatchObject({ field: "clientEmail" });
    expect(await countProjects()).toBe(before);
    expect(harness.invitations.calls).toEqual([]);
  });

  it("membre client existant : accès direct au projet dans la transaction, aucune invitation", async () => {
    const res = await create(as("owner"), { name: "Client connu", clientEmail: scene.c3.email });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const links = await database.query<{ user_id: string }>(
      "SELECT user_id FROM project_client_access WHERE project_id = $1",
      [res.body.id],
    );
    expect(links).toEqual([{ user_id: scene.c3.userId }]);
    expect(harness.invitations.calls).toEqual([]);
    const seen = await send(
      harness.app,
      scene.c3.cookie,
      "get",
      "/projects/cards?q=Client%20connu",
    );
    expect(seen.body.items.map((item: { id: string }) => item.id)).toEqual([res.body.id]);
  });

  it("invitation vivante pour cette adresse : le projet lui est ajouté, aucune nouvelle invitation", async () => {
    const invitationId = randomUUID();
    await database.query(
      `INSERT INTO invitations (id, organization_id, email, role, status, expires_at, inviter_id, created_at, updated_at)
       VALUES ($1, $2, 'vivante@exemple.fr', 'client', 'pending', now() + interval '3 days', $3, now(), now())`,
      [invitationId, scene.organizationId, scene.staff.owner.userId],
    );
    const res = await create(as("owner"), {
      name: "Déjà invité",
      clientEmail: "Vivante@exemple.fr",
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const linked = await database.query<{ invitation_id: string }>(
      "SELECT invitation_id FROM invitation_projects WHERE project_id = $1",
      [res.body.id],
    );
    expect(linked).toEqual([{ invitation_id: invitationId }]);
    expect(harness.invitations.calls).toEqual([]);
  });

  it("l'envoi échoue après le commit : le projet existe, la panne est journalisée, pas d'erreur 5xx", async () => {
    harness.invitations.failNext = true;
    const res = await create(as("owner"), {
      name: "Invitation HS",
      clientEmail: "autre@exemple.fr",
    });
    expect(res.status).toBe(200);
    expect(await pageCount(res.body.id)).toBe(10);
  });

  it("un rejeu idempotent n'invite pas une seconde fois", async () => {
    const body = {
      name: "Rejeu invité",
      clientEmail: "rejeu@exemple.fr",
      idempotencyKey: "cle-inv",
    };
    await create(as("owner"), body);
    await create(as("owner"), body);
    expect(harness.invitations.calls).toHaveLength(1);
  });
});

describe("TK-93 project.creationStatus", () => {
  it("null pour un projet sans ligne ; 404 uniforme hors accès", async () => {
    const res = await send(
      harness.app,
      as("dev"),
      "get",
      `/projects/${scene.projects.old}/creation`,
    );
    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
    const unlinked = await send(
      harness.app,
      scene.c1.cookie,
      "get",
      `/projects/${scene.projects.p2}/creation`,
    );
    expect(unlinked.status).toBe(404);
    const unknown = await send(harness.app, as("dev"), "get", `/projects/${randomUUID()}/creation`);
    expect(unknown.status).toBe(404);
    expect(unknown.body).toEqual(unlinked.body);
  });

  it("étapes, pages d'idée et droit d'agir selon le rôle ; le client lié le lit sans pouvoir agir", async () => {
    const installation = await install({ ownerLogin: "acme-statut" });
    const created = await create(as("owner"), { name: "Statut", installationId: installation.id });
    const path = `/projects/${created.body.id}/creation`;
    const owner = await send(harness.app, as("owner"), "get", path);
    expect(owner.body).toMatchObject({
      status: "pending",
      ideaPages: 10,
      canAct: true,
      steps: [
        { key: "project", status: "done" },
        { key: "idea", status: "done" },
        { key: "repo", status: "running" },
      ],
    });
    expect((await send(harness.app, as("dev"), "get", path)).body.canAct).toBe(false);
    await database.query(
      `UPDATE project_creations SET status = 'failed', error_code = 'user_token_required' WHERE project_id = $1`,
      [created.body.id],
    );
    await database.query(
      `INSERT INTO project_client_access (id, organization_id, project_id, user_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, now(), now())`,
      [randomUUID(), scene.organizationId, created.body.id, scene.c3.userId],
    );
    const client = await send(harness.app, scene.c3.cookie, "get", path);
    expect(client.status).toBe(200);
    expect(client.body).toMatchObject({
      status: "failed",
      canAct: false,
      error: { code: "user_token_required", ownerLogin: "acme-statut", repoName: "statut-spec" },
    });
    expect(client.body.steps.at(-1)).toEqual({ key: "repo", status: "error" });
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même route, un test par cas
describe("TK-93 project.retryRepo", () => {
  async function failedProject(over: Record<string, unknown> = {}) {
    const installation = await install();
    const created = await create(as("owner"), {
      name: "À relancer",
      installationId: installation.id,
      ...over,
    });
    await database.query(
      "UPDATE project_creations SET status = 'failed', error_code = 'name_taken' WHERE project_id = $1",
      [created.body.id],
    );
    harness.queue.jobs = [];
    return { id: created.body.id as string, installation };
  }
  const retry = (cookie: string, projectId: string, body: Record<string, unknown> = {}) =>
    send(harness.app, cookie, "post", `/projects/${projectId}/creation/retry`, body);

  it("après un échec : nouvelle ligne pending, job déposé, audit, état rendu", async () => {
    const { id } = await failedProject();
    const res = await retry(as("admin"), id);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toMatchObject({ status: "pending", canAct: true });
    const rows = await creationRows(id);
    expect(rows.map((row) => row.status)).toEqual(["failed", "pending"]);
    expect(harness.queue.jobs).toEqual([{ id: rows[1]?.id, creationId: rows[1]?.id }]);
    expect(await audit("project.retry_repo", id)).toHaveLength(1);
  });

  it("nom de dépôt et compte changés : la nouvelle ligne les porte", async () => {
    const { id } = await failedProject();
    const other = await install({ ownerLogin: "autre-compte" });
    const res = await retry(as("owner"), id, { repoName: "nouveau-nom", installationId: other.id });
    expect(res.status).toBe(200);
    expect((await creationRows(id))[1]).toMatchObject({
      repo_name: "nouveau-nom",
      installation_id: other.id,
    });
  });

  it("nom invalide : 422 sans nouvelle ligne ; compte inconnu : 422", async () => {
    const { id } = await failedProject();
    expect((await retry(as("owner"), id, { repoName: ".." })).status).toBe(422);
    expect((await retry(as("owner"), id, { installationId: randomUUID() })).status).toBe(422);
    expect(await creationRows(id)).toHaveLength(1);
  });

  it("déjà en cours : 409 creation_running ; déjà réussie : 409 creation_succeeded", async () => {
    const { id } = await failedProject();
    await retry(as("owner"), id);
    const running = await retry(as("owner"), id);
    expect(running.status).toBe(409);
    expect(running.body.data).toEqual({ reason: "creation_running" });
    await database.query(
      "UPDATE project_creations SET status = 'succeeded' WHERE project_id = $1",
      [id],
    );
    const done = await retry(as("owner"), id);
    expect(done.status).toBe(409);
    expect(done.body.data).toEqual({ reason: "creation_succeeded" });
    expect(await creationRows(id)).toHaveLength(2);
  });

  it("deux relances simultanées : une seule nouvelle ligne", async () => {
    const { id } = await failedProject();
    const results = await Promise.all([retry(as("owner"), id), retry(as("admin"), id)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await creationRows(id)).toHaveLength(2);
  });

  it("droits : dev, designer, business et client reçoivent 403 ; projet inconnu 404", async () => {
    const { id } = await failedProject();
    for (const cookie of [as("dev"), as("designer"), as("business"), scene.c1.cookie]) {
      expect((await retry(cookie, id)).status).toBe(403);
    }
    expect((await retry(as("owner"), randomUUID())).status).toBe(404);
    expect(await creationRows(id)).toHaveLength(1);
  });
});

describe("TK-93 project.setEuOnly", () => {
  const setEu = (cookie: string, projectId: string, euOnly: boolean) =>
    send(harness.app, cookie, "patch", `/projects/${projectId}/eu-only`, { euOnly });
  const flag = async (projectId: string) =>
    (
      await database.query<{ eu_only: boolean }>("SELECT eu_only FROM projects WHERE id = $1", [
        projectId,
      ])
    )[0]?.eu_only;

  it("owner et admin : le réglage change, est journalisé, et peut être rétabli", async () => {
    const id = scene.projects.p1;
    const on = await setEu(as("owner"), id, true);
    expect(on.body).toEqual({ euOnly: true });
    expect(await flag(id)).toBe(true);
    const off = await setEu(as("admin"), id, false);
    expect(off.body).toEqual({ euOnly: false });
    expect(await flag(id)).toBe(false);
    expect(await audit("project.eu_only", id)).toHaveLength(2);
  });

  it("dev, designer, business et client : 403, rien ne change", async () => {
    const id = scene.projects.p2;
    for (const cookie of [as("dev"), as("designer"), as("business"), scene.c2.cookie]) {
      expect((await setEu(cookie, id, true)).status).toBe(403);
    }
    expect(await flag(id)).toBe(false);
  });

  it("projet inconnu ou d'une autre organisation : 404", async () => {
    expect((await setEu(as("owner"), randomUUID(), true)).status).toBe(404);
    expect((await setEu(as("owner"), scene.foreign.projectId, true)).status).toBe(404);
    expect(await flag(scene.foreign.projectId)).toBe(false);
  });
});

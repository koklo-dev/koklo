import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { installBench } from "./helpers/repo-scene.ts";
import { shellApi } from "./helpers/shell.ts";
import { readScene, type SpecReadScene, seedIndex } from "./helpers/spec-read.ts";
import { createWorld, insertProject, linkClient, type World } from "./helpers/tickets.ts";

/**
 * TK-88 lot A (A9, A10) : `search.query`, GET /search?q=&projectId= (palette ⌘K, B3 et B81). La
 * recherche se fait côté serveur, sur des éléments non chargés : 1 000 tickets et 300 fonctionnalités
 * semés. 20 résultats au plus, `total` réel ; projets, puis fonctionnalités et tickets du projet courant.
 */
const bench = installBench({ beforeAll, afterAll, beforeEach });

interface Scene {
  s: SpecReadScene;
  world: World;
  bravo: string;
  other: string;
}
let scene: Scene;

const sql = <Row extends Record<string, unknown> = Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
) => bench().database.query<Row>(text, params);

async function seedTickets(world: World, projectId: string, total: number, title: string) {
  await sql(
    `INSERT INTO tickets (id, organization_id, project_id, key, title, description, type, status,
                          priority, pkg, sensitivity, attempts, review_rounds, created_at, updated_at)
     SELECT gen_random_uuid(), $1, $2::uuid, 'TK-' || n, $3 || ' ' || n, 'Jeu de recherche',
            'task'::ticket_type, 'todo'::ticket_status, 'medium'::ticket_priority,
            'api'::ticket_package, 'safe'::sensitivity, 0, 0, now(), now()
       FROM generate_series(1, $4::int) AS n`,
    [world.organizationId, projectId, title, total],
  );
}

async function build(): Promise<Scene> {
  const s = await readScene(bench());
  const { world } = s;
  await seedIndex(bench(), s, [{ id: "F-001", titre: "Connexion" }]);
  const [snapshot] = await sql<{ snapshot_id: string }>(
    "SELECT h.snapshot_id FROM spec_heads h WHERE h.repo_id = $1",
    [s.repoId],
  );
  await sql(
    `INSERT INTO spec_features (id, organization_id, snapshot_id, spec_id, title, status, priority,
                               file_path, created_at, updated_at)
     SELECT gen_random_uuid(), $1, $2::uuid, 'F-' || lpad(n::text, 3, '0'), 'Paiement ' || n,
            'brouillon'::feature_status, 'should'::feature_priority, 'features/F-' || n || '.md', now(), now()
       FROM generate_series(2, 301) AS n`,
    [world.organizationId, snapshot?.snapshot_id],
  );
  await sql("UPDATE projects SET name = 'Facturation Alpha' WHERE id = $1", [world.projectId]);
  const bravo = await insertProject(bench().database, world.organizationId, "Facturation Bravo");
  const other = await insertProject(bench().database, world.organizationId, "Autre projet");
  await seedTickets(world, world.projectId, 1000, "Ticket de facturation");
  await seedTickets(world, bravo, 1, "Isolation facturation");
  // `readScene` crée un monde sans client lié : le client n'a que « Facturation Alpha », pas Bravo.
  await linkClient(
    bench().database,
    world.organizationId,
    world.projectId,
    world.actors.client.userId,
  );
  return { s, world, bravo, other };
}

let built: Promise<Scene> | undefined;
beforeEach(async () => {
  built ??= build();
  scene = await built;
});

const q = (text: string, projectId?: string) =>
  `?q=${encodeURIComponent(text)}${projectId ? `&projectId=${projectId}` : ""}`;
const as = (role: keyof World["actors"], w: World = scene.world) =>
  shellApi(bench().app, w.actors[role]);
const kinds = (body: { items: { kind: string }[] }) => body.items.map((i) => i.kind);

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("A9 recherche sur des éléments non chargés", () => {
  it("projets d'abord, puis tickets : 20 résultats au plus, total réel (2 projets + 1 000 tickets)", async () => {
    const res = await as("dev").search(q("facturation", scene.world.projectId));
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.items).toHaveLength(20);
    expect(res.body.total).toBe(1002);
    expect(kinds(res.body).slice(0, 3)).toEqual(["project", "project", "ticket"]);
    expect(res.body.items.slice(0, 2).map((p: { name: string }) => p.name)).toEqual([
      "Facturation Alpha",
      "Facturation Bravo",
    ]);
    expect(new Set(kinds(res.body).slice(2))).toEqual(new Set(["ticket"]));
    expect(res.body.nextCursor).toBeNull();
    expect(res.body.previousCursor).toBeNull();
    expect(res.body.offset).toBe(0);
  });

  it("fonctionnalités : 300 « Paiement n », 20 rendues, total 300, par numéro croissant", async () => {
    const res = await as("dev").search(q("paiement", scene.world.projectId));
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.total).toBe(300);
    expect(res.body.items).toHaveLength(20);
    expect(new Set(kinds(res.body))).toEqual(new Set(["feature"]));
    expect(res.body.items[0]).toEqual({
      kind: "feature",
      projectId: scene.world.projectId,
      specId: "F-002",
      title: "Paiement 2",
    });
    expect(res.body.items[19].specId).toBe("F-021");
  });

  it("par identifiant : F-010 trouve la fonctionnalité, TK-5 trouve le ticket", async () => {
    const feature = await as("dev").search(q("F-010", scene.world.projectId));
    expect(feature.body.items[0]).toMatchObject({ kind: "feature", specId: "F-010" });
    const ticket = await as("dev").search(q("TK-5", scene.world.projectId));
    expect(ticket.body.items[0]).toEqual({
      kind: "ticket",
      projectId: scene.world.projectId,
      key: "TK-5",
      title: "Ticket de facturation 5",
      status: "todo",
    });
  });

  it("insensible à la casse et aux accents du titre ; aucun résultat : total 0", async () => {
    expect((await as("dev").search(q("FACTURATION"))).body.total).toBe(2);
    expect((await as("dev").search(q("introuvable-xyz", scene.world.projectId))).body).toEqual({
      items: [],
      nextCursor: null,
      previousCursor: null,
      offset: 0,
      total: 0,
    });
  });

  it("les jokers SQL de la saisie sont littéraux (« % » et « _ » ne trouvent pas tous les projets)", async () => {
    expect((await as("dev").search(q("%"))).body.total).toBe(0);
    expect((await as("dev").search(q("_"))).body.total).toBe(0);
  });

  it("sans projectId : les projets seulement, jamais de ticket ni de fonctionnalité", async () => {
    const res = await as("dev").search(q("facturation"));
    expect(res.body.total).toBe(2);
    expect(new Set(kinds(res.body))).toEqual(new Set(["project"]));
    expect((await as("dev").search(q("paiement"))).body.total).toBe(0);
  });

  it("avec un autre projet courant : ses tickets seulement, jamais ceux du projet voisin", async () => {
    const res = await as("dev").search(q("isolation", scene.bravo));
    expect(res.body.items).toEqual([
      {
        kind: "ticket",
        projectId: scene.bravo,
        key: "TK-1",
        title: "Isolation facturation 1",
        status: "todo",
      },
    ]);
    expect((await as("dev").search(q("paiement", scene.bravo))).body.total).toBe(0);
  });

  it("un ticket supprimé n'est jamais trouvé", async () => {
    await sql("UPDATE tickets SET deleted_at = now() WHERE project_id = $1 AND key = 'TK-7'", [
      scene.world.projectId,
    ]);
    const res = await as("dev").search(q("TK-7", scene.world.projectId));
    expect(res.body.items.find((i: { key?: string }) => i.key === "TK-7")).toBeUndefined();
    await sql("UPDATE tickets SET deleted_at = NULL WHERE project_id = $1 AND key = 'TK-7'", [
      scene.world.projectId,
    ]);
  });

  it("tous les rôles d'équipe cherchent ; la recherche n'écrit rien (audit inchangé)", async () => {
    const [before] = await sql<{ n: number }>(
      "SELECT count(*)::int AS n FROM audit_log WHERE organization_id = $1",
      [scene.world.organizationId],
    );
    for (const role of ["owner", "admin", "dev", "designer", "business"] as const) {
      const res = await as(role).search(q("connexion", scene.world.projectId));
      expect(res.status, role).toBe(200);
      expect(res.body.items[0]).toMatchObject({ kind: "feature", specId: "F-001" });
    }
    const [after] = await sql<{ n: number }>(
      "SELECT count(*)::int AS n FROM audit_log WHERE organization_id = $1",
      [scene.world.organizationId],
    );
    expect(after?.n).toBe(before?.n);
  });
});

describe("A9 cloisonnement", () => {
  it("projet d'une autre organisation ou inconnu : 404 uniforme, comme un client non lié", async () => {
    const foreign = await createWorld(bench().database);
    const unknown = "99999999-9999-4999-8999-999999999999";
    const responses = [
      await as("dev").search(q("facturation", foreign.projectId)),
      await as("dev").search(q("facturation", unknown)),
      await as("client").search(q("facturation", scene.bravo)),
    ];
    for (const res of responses) {
      expect(res.status, JSON.stringify(res.body)).toBe(404);
      expect(res.body.code).toBe("NOT_FOUND");
    }
  });

  it("une autre organisation ne voit rien de celle-ci", async () => {
    const foreign = await createWorld(bench().database);
    const res = await as("owner", foreign).search(q("facturation"));
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(0);
  });
});

describe("A10 le client ne reçoit ni fonctionnalité ni contenu de spec", () => {
  it("fonctionnalités : zéro résultat, total 0, même par identifiant exact", async () => {
    for (const text of ["paiement", "connexion", "F-001"]) {
      const res = await as("client").search(q(text, scene.world.projectId));
      expect(res.status, text).toBe(200);
      expect(res.body.total, text).toBe(0);
      expect(kinds(res.body), text).not.toContain("feature");
    }
  });

  it("projets liés et tickets de son projet seulement (le projet non lié reste invisible)", async () => {
    const res = await as("client").search(q("facturation", scene.world.projectId));
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1001);
    expect(res.body.items.filter((i: { kind: string }) => i.kind === "project")).toEqual([
      expect.objectContaining({ name: "Facturation Alpha", id: scene.world.projectId }),
    ]);
    expect(JSON.stringify(res.body)).not.toContain("Bravo");
    expect(JSON.stringify(res.body)).not.toContain("Isolation");
  });

  it("sans projectId, le client ne trouve que ses projets liés", async () => {
    const res = await as("client").search(q("facturation"));
    expect(res.body.items.map((p: { name: string }) => p.name)).toEqual(["Facturation Alpha"]);
  });

  it("client sans aucun lien : rien, sans erreur", async () => {
    const world = await createWorld(bench().database, { linkedClient: false });
    const res = await shellApi(bench().app, world.actors.client).search(q("projet"));
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(0);
  });
});

describe("A10 validation et session", () => {
  it.each([
    ["q vide", "?q="],
    ["q absent", ""],
    ["q de 201 caractères", `?q=${"a".repeat(201)}`],
    ["projectId mal formé", "?q=a&projectId=pas-un-uuid"],
  ])("%s : 422 VALIDATION", async (_name, query) => {
    const res = await as("dev").search(query);
    expect(res.status, JSON.stringify(res.body)).toBe(422);
    expect(res.body.code).toBe("VALIDATION");
  });

  it("q de 200 caractères : accepté", async () => {
    expect((await as("dev").search(q("a".repeat(200)))).status).toBe(200);
  });

  it("sans session : 401", async () => {
    expect((await shellApi(bench().app, undefined).search(q("a"))).status).toBe(401);
  });
});

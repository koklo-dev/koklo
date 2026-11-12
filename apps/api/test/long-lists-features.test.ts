import { randomUUID } from "node:crypto";
import type { TestDatabase } from "@koklo/db/testing";
import type { INestApplication } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp, createSeededDatabase } from "./helpers/app.ts";
import { featureRange, specIds, volumeWorld } from "./helpers/long-lists.ts";
import { specReadApi } from "./helpers/spec-read.ts";
import type { World } from "./helpers/tickets.ts";

/**
 * TK-94 (T6 à T10) : `spec.listFeatures` en liste longue sur 1 000 fonctionnalités : total réel,
 * facettes, tri numérique stable, recherche et filtres CÔTÉ SERVEUR (éléments non chargés), lien
 * direct `around` vers un élément hors première page.
 */
let database: TestDatabase;
let app: INestApplication;
let world: World;

beforeAll(async () => {
  database = await createSeededDatabase();
  app = await createApp({ databaseUrl: database.url });
  world = await volumeWorld(database);
});

afterAll(async () => {
  await app?.close();
  await database?.dispose();
});

const list = (query = "", target: World = world) =>
  specReadApi(app, target.actors.dev).list(target.projectId, query);
const encoded = (value: string) => encodeURIComponent(value);
const sum = (counts: Record<string, number>) => Object.values(counts).reduce((a, b) => a + b, 0);

async function sqlCount(where: string, params: unknown[] = []): Promise<number> {
  const [row] = await database.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM spec_features f
       JOIN spec_snapshots s ON s.id = f.snapshot_id JOIN project_repos r ON r.id = s.repo_id
      WHERE r.project_id = $1 AND ${where}`,
    [world.projectId, ...params],
  );
  return row?.n ?? 0;
}

describe("T6 total réel et facettes", () => {
  it("1 000 fonctionnalités, limit 50 : total 1000, 50 éléments, offset 0, pas de page avant", async () => {
    const res = await list("?limit=50");
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.total).toBe(1000);
    expect(res.body.items).toHaveLength(50);
    expect(res.body.offset).toBe(0);
    expect(res.body.previousCursor).toBeNull();
    expect(typeof res.body.nextCursor).toBe("string");
    expect(specIds(res.body)).toEqual(featureRange(1, 50));
  });

  it("la taille de page par défaut est 50", async () => {
    const res = await list();
    expect(res.body.items).toHaveLength(50);
  });

  it("les facettes de statut et de priorité somment au total sans filtre", async () => {
    const res = await list("?limit=1");
    expect(sum(res.body.facets.status)).toBe(1000);
    expect(sum(res.body.facets.priority)).toBe(1000);
    expect(Object.keys(res.body.facets.status).sort()).toEqual(
      ["adoptee", "brouillon", "implementee", "specifiee"].sort(),
    );
  });

  it("filtré par statut : total = nombre filtré ; la facette de statut garde les autres statuts", async () => {
    const expected = await sqlCount("f.status = 'specifiee'");
    const res = await list("?status=specifiee&limit=10");
    expect(res.body.total).toBe(expected);
    expect(expected).toBeGreaterThan(0);
    expect(expected).toBeLessThan(1000);
    expect(sum(res.body.facets.status)).toBe(1000);
    expect(sum(res.body.facets.priority)).toBe(expected);
    expect(res.body.items.every((item: { status: string }) => item.status === "specifiee")).toBe(
      true,
    );
  });

  it("aucun résultat : items vides, total 0, pas de curseur", async () => {
    const res = await list("?q=zzzzzzzz");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      items: [],
      total: 0,
      offset: 0,
      nextCursor: null,
      previousCursor: null,
    });
  });
});

describe("T7 tri numérique et stabilité sous insertion", () => {
  it("F-999 avant F-1000, sans doublon ni trou sur l'ensemble des pages", async () => {
    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const res = await list(`?limit=100${cursor ? `&cursor=${encoded(cursor)}` : ""}`);
      expect(res.status).toBe(200);
      seen.push(...specIds(res.body));
      cursor = res.body.nextCursor;
    } while (cursor);
    expect(seen).toHaveLength(1000);
    expect(new Set(seen).size).toBe(1000);
    expect(seen.indexOf("F-999")).toBe(seen.indexOf("F-1000") - 1);
    expect(seen.slice(0, 3)).toEqual(["F-001", "F-002", "F-003"]);
  });

  it("une insertion et une suppression entre deux pages ne dupliquent ni ne sautent aucune ligne", async () => {
    const mine = await volumeWorld(database);
    const first = await list("?limit=50", mine);
    expect(specIds(first.body)).toEqual(featureRange(1, 50));
    const [snapshot] = await database.query<{ id: string }>(
      `SELECT s.id FROM spec_snapshots s JOIN project_repos r ON r.id = s.repo_id WHERE r.project_id = $1`,
      [mine.projectId],
    );
    await database.query("DELETE FROM spec_features WHERE snapshot_id = $1 AND spec_id = 'F-010'", [
      snapshot?.id,
    ]);
    await database.query(
      `INSERT INTO spec_features (id, organization_id, snapshot_id, spec_id, title, status, priority,
         file_path, created_at, updated_at)
       VALUES ($1, $2, $3, 'F-1001', 'Ajoutée en cours de route', 'brouillon', 'should',
               'features/F-1001.md', now(), now())`,
      [randomUUID(), mine.organizationId, snapshot?.id],
    );

    const rest: string[] = [];
    let cursor: string | null = first.body.nextCursor;
    while (cursor) {
      const page = await list(`?limit=100&cursor=${encoded(cursor)}`, mine);
      rest.push(...specIds(page.body));
      cursor = page.body.nextCursor;
    }
    expect(rest).toEqual(featureRange(51, 1000).concat("F-1001"));
  });
});

describe("T8 recherche sur des éléments non chargés", () => {
  it("« annulation groupée » trouve la fonctionnalité de la page 15, total reflète la recherche", async () => {
    const res = await list(`?q=${encoded("annulation groupée")}`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.items).toHaveLength(1);
    const rank = Number(res.body.items[0].specId.slice(2));
    expect(Math.ceil(rank / 50)).toBe(15);
    expect(res.body.items[0].title.toLowerCase()).toContain("annulation groupée");
  });

  it("un préfixe (« annul ») est trouvé", async () => {
    const exact = await list(`?q=${encoded("annulation groupée")}`);
    const prefix = await list("?q=annul");
    expect(prefix.body.total).toBeGreaterThanOrEqual(1);
    expect(specIds(prefix.body)).toContain(specIds(exact.body)[0]);
  });

  it("tous les mots sont exigés (ET) : un mot absent ne trouve rien", async () => {
    const res = await list(`?q=${encoded("annulation inexistantxyz")}`);
    expect(res.body.total).toBe(0);
  });

  it("l'identifiant est cherchable : « F-187 » trouve F-187", async () => {
    const res = await list(`?q=${encoded("F-187")}`);
    expect(specIds(res.body)).toContain("F-187");
  });

  it("les caractères spéciaux de tsquery ne provoquent aucune erreur 500", async () => {
    for (const q of [
      "& | ! ( ) : '",
      "annul:*)",
      "'; DROP TABLE spec_features; --",
      "a <-> b",
      "\\",
      "***",
      "é&è|ï",
    ]) {
      const res = await list(`?q=${encoded(q)}`);
      expect(res.status, q).toBe(200);
      expect(Array.isArray(res.body.items), q).toBe(true);
    }
    expect(await sqlCount("TRUE")).toBeGreaterThanOrEqual(1000);
  });
});

describe("T9 filtres combinés sur le jeu complet", () => {
  it("q + priorité + statut : même résultat que le décompte SQL indépendant", async () => {
    const expected = await sqlCount(
      "f.title ILIKE 'Exporter %' AND f.priority = 'must' AND f.status = 'specifiee'",
    );
    const res = await list("?q=exporter&priority=must&status=specifiee&limit=100");
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(expected);
    expect(expected).toBeGreaterThan(0);
    expect(res.body.items).toHaveLength(Math.min(expected, 100));
  });

  it("les facettes d'une dimension ignorent le filtre de cette dimension", async () => {
    const res = await list("?q=exporter&priority=must&status=specifiee");
    const byStatus = await database.query<{ status: string; n: number }>(
      `SELECT f.status, count(*)::int AS n FROM spec_features f
         JOIN spec_snapshots s ON s.id = f.snapshot_id JOIN project_repos r ON r.id = s.repo_id
        WHERE r.project_id = $1 AND f.title ILIKE 'Exporter %' AND f.priority = 'must'
        GROUP BY f.status`,
      [world.projectId],
    );
    const byPriority = await database.query<{ priority: string; n: number }>(
      `SELECT f.priority, count(*)::int AS n FROM spec_features f
         JOIN spec_snapshots s ON s.id = f.snapshot_id JOIN project_repos r ON r.id = s.repo_id
        WHERE r.project_id = $1 AND f.title ILIKE 'Exporter %' AND f.status = 'specifiee'
        GROUP BY f.priority`,
      [world.projectId],
    );
    expect(res.body.facets.status).toEqual(
      Object.fromEntries(byStatus.map((r) => [r.status, r.n])),
    );
    expect(res.body.facets.priority).toEqual(
      Object.fromEntries(byPriority.map((r) => [r.priority, r.n])),
    );
  });

  it("la pagination d'une recherche suit son propre total", async () => {
    const first = await list("?q=exporter&limit=20");
    const total = first.body.total as number;
    expect(total).toBeGreaterThan(20);
    const second = await list(`?q=exporter&limit=20&cursor=${encoded(first.body.nextCursor)}`);
    expect(second.body.total).toBe(total);
    expect(second.body.offset).toBe(20);
    expect(specIds(second.body).some((id) => specIds(first.body).includes(id))).toBe(false);
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("T10 lien direct hors première page (around)", () => {
  it("around=F-187 : la page qui contient F-187, alignée sur limit, page précédente disponible", async () => {
    const res = await list("?around=F-187&limit=50");
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(specIds(res.body)).toEqual(featureRange(151, 200));
    expect(res.body.offset).toBe(150);
    expect(res.body.offset % 50).toBe(0);
    expect(typeof res.body.previousCursor).toBe("string");
    expect(typeof res.body.nextCursor).toBe("string");
    expect(res.body.total).toBe(1000);
  });

  it("previousCursor charge la page d'avant, nextCursor celle d'après, sans trou", async () => {
    const mid = await list("?around=F-187&limit=50");
    const before = await list(`?limit=50&cursor=${encoded(mid.body.previousCursor)}`);
    expect(specIds(before.body)).toEqual(featureRange(101, 150));
    expect(before.body.offset).toBe(100);
    const after = await list(`?limit=50&cursor=${encoded(mid.body.nextCursor)}`);
    expect(specIds(after.body)).toEqual(featureRange(201, 250));
    expect(after.body.offset).toBe(200);
    const back = await list(`?limit=50&cursor=${encoded(after.body.previousCursor)}`);
    expect(back.body.offset).toBe(150);
  });

  it("remonter jusqu'au début atteint F-001 puis plus de previousCursor", async () => {
    let page = await list("?around=F-187&limit=50");
    const seen = [...specIds(page.body)];
    while (page.body.previousCursor) {
      page = await list(`?limit=50&cursor=${encoded(page.body.previousCursor)}`);
      seen.unshift(...specIds(page.body));
    }
    expect(seen).toEqual(featureRange(1, 200));
    expect(page.body.offset).toBe(0);
  });

  it("bords : around=F-001 (pas de page avant), around=F-1000 (pas de page après, offset 950)", async () => {
    const first = await list("?around=F-001");
    expect(first.body.offset).toBe(0);
    expect(first.body.previousCursor).toBeNull();
    const last = await list("?around=F-1000");
    expect(last.body.offset).toBe(950);
    expect(last.body.nextCursor).toBeNull();
    expect(specIds(last.body).at(-1)).toBe("F-1000");
  });

  it("limit 30 : la fenêtre part d'un multiple de 30", async () => {
    const res = await list("?around=F-187&limit=30");
    expect(res.body.offset).toBe(180);
    expect(specIds(res.body)).toEqual(featureRange(181, 210));
  });

  it("around s'applique à la liste filtrée : offset dans la liste filtrée", async () => {
    const pick = await list("?priority=must&limit=100");
    const target = specIds(pick.body)[60] as string;
    const res = await list(`?priority=must&around=${target}&limit=20`);
    expect(res.status).toBe(200);
    expect(specIds(res.body)).toContain(target);
    expect(res.body.offset).toBe(60 - (60 % 20));
    expect(res.body.total).toBe(pick.body.total);
  });

  it("around inconnu : 404 NOT_FOUND", async () => {
    const res = await list("?around=F-5000");
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("NOT_FOUND");
  });

  it("around existant mais écarté par les filtres : la première page, sans erreur", async () => {
    const [row] = await database.query<{ spec_id: string }>(
      `SELECT f.spec_id FROM spec_features f JOIN spec_snapshots s ON s.id = f.snapshot_id
         JOIN project_repos r ON r.id = s.repo_id
        WHERE r.project_id = $1 AND f.status = 'brouillon' ORDER BY f.spec_number LIMIT 1`,
      [world.projectId],
    );
    const res = await list(`?around=${row?.spec_id}&status=adoptee&limit=20`);
    expect(res.status).toBe(200);
    expect(res.body.offset).toBe(0);
    expect(specIds(res.body)).not.toContain(row?.spec_id);
  });

  it("around avec cursor : 422 VALIDATION ; around mal formé : 422", async () => {
    const both = await list(`?around=F-187&cursor=${encoded("x")}`);
    expect(both.status).toBe(422);
    expect(both.body.code).toBe("VALIDATION");
    const bad = await list("?around=pas-un-id");
    expect(bad.status).toBe(422);
  });

  it("un curseur forgé ou d'une autre liste est refusé : 422 VALIDATION sur le champ cursor", async () => {
    const bad = await list(
      `?cursor=${encoded(Buffer.from('["after","x","y"]').toString("base64url"))}`,
    );
    expect(bad.status).toBe(422);
    expect(bad.body.data.field).toBe("cursor");
  });
});

/**
 * TK-102 (contrat 3.0.0) : `validation` par ligne (dernière review de la fonctionnalité sur le contenu courant) et filtre
 * serveur sur la liste entière, y compris les éléments non chargés ; la facette de validation ignore son propre filtre.
 */
// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("T11 validation par ligne et filtre", () => {
  const OLD_SHA = "a".repeat(40);
  let reviewed: World;

  async function review(
    target: World,
    specId: string,
    status: "approved" | "changes_requested",
    sha: string,
    at: string,
  ) {
    const [repo] = await database.query<{ id: string }>(
      "SELECT id FROM project_repos WHERE project_id = $1 LIMIT 1",
      [target.projectId],
    );
    await database.query(
      `INSERT INTO reviews (id, organization_id, project_id, repo_id, target_kind, target_ref, sha, status,
                            author_user_id, author_role, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'feature', $5, $6, $7, $8, 'owner', $9::timestamptz, $9::timestamptz)`,
      [
        randomUUID(),
        target.organizationId,
        target.projectId,
        repo?.id,
        specId,
        sha,
        status,
        target.actors.owner.userId,
        at,
      ],
    );
  }

  beforeAll(async () => {
    reviewed = await volumeWorld(database);
    const [head] = await database.query<{ commit_sha: string }>(
      `SELECT s.commit_sha FROM spec_snapshots s JOIN project_repos r ON r.id = s.repo_id
        WHERE r.project_id = $1 ORDER BY s.indexed_at DESC LIMIT 1`,
      [reviewed.projectId],
    );
    const sha = head?.commit_sha as string;
    await review(reviewed, "F-001", "approved", sha, "2026-11-01T10:00:00Z");
    await review(reviewed, "F-002", "changes_requested", sha, "2026-11-01T10:00:00Z");
    await review(reviewed, "F-003", "approved", OLD_SHA, "2026-11-01T10:00:00Z");
    await review(reviewed, "F-004", "changes_requested", sha, "2026-11-01T10:00:00Z");
    await review(reviewed, "F-004", "approved", sha, "2026-11-02T10:00:00Z");
  });

  const listReviewed = (query = "") => list(query, reviewed);

  it("chaque ligne porte sa validation : validée, à revoir, ou à valider (sans review ou périmée) ; la plus récente fait foi", async () => {
    const res = await listReviewed("?limit=5");
    const byId = Object.fromEntries(
      res.body.items.map((item: { specId: string; validation: string }) => [
        item.specId,
        item.validation,
      ]),
    );
    expect(byId).toEqual({
      "F-001": "validated",
      "F-002": "to_revise",
      "F-003": "to_validate",
      "F-004": "validated",
      "F-005": "to_validate",
    });
  });

  it("la facette de validation compte toute la liste, et chaque dimension ignore son propre filtre", async () => {
    const all = await listReviewed("?limit=1");
    expect(all.body.facets.validation).toEqual({ validated: 2, to_revise: 1, to_validate: 997 });
    const filtered = await listReviewed("?validation=validated&limit=1");
    expect(filtered.body.facets.validation).toEqual({
      validated: 2,
      to_revise: 1,
      to_validate: 997,
    });
    expect(sum(filtered.body.facets.status)).toBe(2);
    expect(sum(filtered.body.facets.priority)).toBe(2);
  });

  it("filtre validation=validated : le total est celui de la liste entière, pas des éléments chargés", async () => {
    const res = await listReviewed("?validation=validated&limit=1");
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.total).toBe(2);
    expect(specIds(res.body)).toEqual(["F-001"]);
    const next = await listReviewed(`?validation=validated&limit=1&cursor=${res.body.nextCursor}`);
    expect(specIds(next.body)).toEqual(["F-004"]);
    expect(next.body.nextCursor).toBeNull();
  });

  it("filtre validation=to_validate : 997 fonctionnalités, y compris la review périmée ; F-002 en est exclue", async () => {
    const res = await listReviewed("?validation=to_validate&limit=100");
    expect(res.body.total).toBe(997);
    expect(specIds(res.body)).toContain("F-003");
    expect(specIds(res.body)).not.toContain("F-002");
    const revise = await listReviewed("?validation=to_revise");
    expect(specIds(revise.body)).toEqual(["F-002"]);
  });

  it("le filtre se combine à la recherche et aux autres filtres ; around reste dans la liste filtrée", async () => {
    const [row] = await database.query<{ status: string }>(
      `SELECT f.status FROM spec_features f JOIN spec_snapshots s ON s.id = f.snapshot_id
         JOIN project_repos r ON r.id = s.repo_id WHERE r.project_id = $1 AND f.spec_id = 'F-001'`,
      [reviewed.projectId],
    );
    const both = await listReviewed(`?validation=validated&status=${row?.status}`);
    expect(specIds(both.body)).toEqual(expect.arrayContaining(["F-001"]));
    expect(both.body.items.every((i: { validation: string }) => i.validation === "validated")).toBe(
      true,
    );
    const around = await listReviewed("?validation=validated&around=F-004&limit=1");
    expect(specIds(around.body)).toEqual(["F-004"]);
    expect(around.body.offset).toBe(1);
    const none = await listReviewed("?validation=to_revise&q=zzzz-introuvable");
    expect(none.body.total).toBe(0);
    expect(none.body.items).toEqual([]);
  });

  it("une valeur inconnue est refusée : 422 VALIDATION", async () => {
    const res = await listReviewed("?validation=approved");
    expect(res.status).toBe(422);
    expect(res.body.code).toBe("VALIDATION");
  });

  it("sans review, tout est à valider ; une autre organisation ne voit pas ces reviews", async () => {
    const res = await list("?limit=1");
    expect(res.body.facets.validation).toEqual({ to_validate: 1000 });
    expect(res.body.items[0].validation).toBe("to_validate");
  });
});

describe("cloisonnement : une autre organisation ne voit rien du volume", () => {
  it("les totaux, les facettes et around d'une autre organisation ne fuient pas", async () => {
    const other = await volumeWorld(database);
    const res = await specReadApi(app, other.actors.dev).list(other.projectId, "?limit=1");
    expect(res.body.total).toBe(1000);
    const cross = await specReadApi(app, other.actors.dev).list(world.projectId, "?limit=1");
    expect(cross.status).toBe(404);
  });
});

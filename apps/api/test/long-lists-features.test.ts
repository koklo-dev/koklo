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

describe("cloisonnement : une autre organisation ne voit rien du volume", () => {
  it("les totaux, les facettes et around d'une autre organisation ne fuient pas", async () => {
    const other = await volumeWorld(database);
    const res = await specReadApi(app, other.actors.dev).list(other.projectId, "?limit=1");
    expect(res.body.total).toBe(1000);
    const cross = await specReadApi(app, other.actors.dev).list(world.projectId, "?limit=1");
    expect(cross.status).toBe(404);
  });
});

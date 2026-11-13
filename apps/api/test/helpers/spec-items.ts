import { createHash, randomUUID } from "node:crypto";
import type { TestDatabase } from "@koklo/db/testing";
import type { INestApplication } from "@nestjs/common";
import type { SpecReadScene } from "./spec-read.ts";
import { send } from "./tickets.ts";

/**
 * Client HTTP et fixtures du panneau d'édition (TK-101, contrat 2.11.0) :
 *  spec.item.get GET /projects/{p}/spec/items/{type}/{id}   spec.refs.search GET /projects/{p}/spec/refs?kinds=..&q=..
 */
export function itemApi(app: INestApplication, actor: { cookie?: string } | undefined) {
  const cookie = actor?.cookie;
  return {
    get: (projectId: string, id: string, type = "feature") =>
      send(app, cookie, "get", `/projects/${projectId}/spec/items/${type}/${id}`),
    search: (projectId: string, kinds: readonly string[], q = "") => {
      const query = new URLSearchParams({ q });
      for (const kind of kinds) query.append("kinds[]", kind);
      return send(app, cookie, "get", `/projects/${projectId}/spec/refs?${query}`);
    },
  };
}

export interface ItemRow {
  kind: "feature" | "rule" | "flow" | "table" | "fixture" | "endpoint" | "screen";
  specId: string;
  /** Contenu libre de l'entité (`data`), `titre` compris. */
  data: Record<string, unknown>;
  sort: number;
}

/** Écrit des lignes `spec_entities` dans le snapshot et pose `entities_indexed_at` (comme le ferait le worker). */
export async function insertItems(
  database: TestDatabase,
  s: Pick<SpecReadScene, "organizationId">,
  snapshotId: string,
  rows: readonly ItemRow[],
  options: { indexed?: boolean } = {},
): Promise<void> {
  const payload = JSON.stringify(
    rows.map((row) => ({
      id: randomUUID(),
      kind: row.kind,
      specId: row.specId,
      data: row.data,
      sort: row.sort,
      hash: createHash("sha256")
        .update(`${row.kind}:${row.specId}:${JSON.stringify(row.data)}`)
        .digest("hex"),
    })),
  );
  await database.query(
    `INSERT INTO spec_entities (id, organization_id, snapshot_id, kind, spec_id, zone, path, data, content_hash, sort, created_at, updated_at)
     SELECT (r->>'id')::uuid, $1, $2, r->>'kind', r->>'specId', NULL, (r->>'kind') || '/' || (r->>'specId'),
            r->'data', r->>'hash', (r->>'sort')::int, now(), now()
       FROM jsonb_array_elements($3::jsonb) AS r`,
    [s.organizationId, snapshotId, payload],
  );
  if (options.indexed !== false) {
    await database.query("UPDATE spec_snapshots SET entities_indexed_at = now() WHERE id = $1", [
      snapshotId,
    ]);
  }
}

/** 1 000 fonctionnalités comme `seed:large` : `F-001`..`F-1000`, le titre connu au rang 703. */
export const volumeFeatures = (count = 1000): ItemRow[] =>
  Array.from({ length: count }, (_, index) => {
    const n = index + 1;
    return {
      kind: "feature",
      specId: `F-${String(n).padStart(3, "0")}`,
      data: {
        titre: n === 703 ? "Annulation groupée des réservations" : `Gérer les réservations (${n})`,
        content_hash: "x",
      },
      sort: n,
    };
  });

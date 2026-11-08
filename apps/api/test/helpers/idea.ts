import type { TestDatabase } from "@koklo/db/testing";
import type { INestApplication } from "@nestjs/common";
import { IDEA_TEMPLATE } from "../../src/idea/idea-template.ts";
import type { Actor } from "./organizations.ts";
import { send } from "./tickets.ts";

/**
 * Client HTTP du groupe `idea` (contrat 2.4.0, fixé par .workflow/TK-89/00-fiche.md).
 *  list GET /projects/{p}/idea/pages            get GET .../pages/{id}          save PUT .../pages/{id}/content
 *  setStatus POST .../pages/{id}/status         publish POST .../publish        presence POST .../presence
 *  page.create POST .../pages  rename PATCH .../pages/{id}  reorder PUT .../pages/order  delete DELETE .../pages/{id}
 *  restore POST .../pages/{id}/restore
 */
export function ideaApi(app: INestApplication, actor: Pick<Actor, "cookie"> | undefined) {
  const cookie = actor?.cookie;
  const base = (p: string) => `/projects/${p}/idea`;
  const page = (p: string, id: string) => `${base(p)}/pages/${id}`;
  return {
    list: (p: string) => send(app, cookie, "get", `${base(p)}/pages`),
    get: (p: string, id: string) => send(app, cookie, "get", page(p, id)),
    save: (p: string, id: string, baseVersion: number, contentMd: string) =>
      send(app, cookie, "put", `${page(p, id)}/content`, {
        projectId: p,
        pageId: id,
        baseVersion,
        contentMd,
      }),
    setStatus: (p: string, id: string, status: string) =>
      send(app, cookie, "post", `${page(p, id)}/status`, { projectId: p, pageId: id, status }),
    publish: (p: string, idempotencyKey: string) =>
      send(app, cookie, "post", `${base(p)}/publish`, { projectId: p, idempotencyKey }),
    presence: (p: string, pageId?: string | null) =>
      send(app, cookie, "post", `${base(p)}/presence`, { projectId: p, pageId }),
    create: (p: string, title: string, afterPageId?: string) =>
      send(app, cookie, "post", `${base(p)}/pages`, { projectId: p, title, afterPageId }),
    rename: (p: string, id: string, title: string) =>
      send(app, cookie, "patch", page(p, id), { projectId: p, pageId: id, title }),
    reorder: (p: string, pageIds: string[]) =>
      send(app, cookie, "put", `${base(p)}/pages/order`, { projectId: p, pageIds }),
    remove: (p: string, id: string) => send(app, cookie, "delete", page(p, id)),
    restore: (p: string, id: string) => send(app, cookie, "post", `${page(p, id)}/restore`, {}),
  };
}

export interface IdeaRow {
  id: string;
  slug: string;
  title: string;
  position: number;
  required: boolean;
  origin: string;
  status: string;
  content_md: string;
  version: number;
  updated_by: string | null;
  deleted_at: Date | null;
}

/** Pages d'un projet en SQL (corbeille comprise), dans l'ordre des positions. */
export function ideaRows(database: TestDatabase, projectId: string) {
  return database.query<IdeaRow>(
    `SELECT id, slug, title, position, required, origin::text AS origin, status::text AS status,
            content_md, version, updated_by, deleted_at
       FROM idea_pages WHERE project_id = $1 ORDER BY (deleted_at IS NOT NULL), position, slug`,
    [projectId],
  );
}

/**
 * Pose le gabarit « cadrage par défaut » dans un projet inséré en SQL (la migration ne couvre que les
 * projets déjà existants, la création par l'API pose les pages elle-même).
 */
export async function seedIdeaTemplate(
  database: TestDatabase,
  s: { organizationId: string; projectId: string },
): Promise<void> {
  for (const [position, entry] of IDEA_TEMPLATE.entries()) {
    await database.query(
      `INSERT INTO idea_pages (id, organization_id, project_id, slug, title, position, required, origin,
                               template_key, status, content_md, version, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, 'template', $3, 'empty', '', 1, now())`,
      [s.organizationId, s.projectId, entry.slug, entry.title, position, entry.required],
    );
  }
}

export async function pageIdOf(database: TestDatabase, projectId: string, slug: string) {
  const [row] = await database.query<{ id: string }>(
    "SELECT id FROM idea_pages WHERE project_id = $1 AND slug = $2",
    [projectId, slug],
  );
  if (!row) throw new Error(`page ${slug} absente`);
  return row.id;
}

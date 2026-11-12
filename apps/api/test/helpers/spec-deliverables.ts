import type { TestDatabase } from "@koklo/db/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import type { Actor } from "./organizations.ts";
import { send } from "./tickets.ts";

/**
 * Client HTTP des livrables de la spec (TK-100, contrat 2.10.0) :
 *  spec.deliverables GET /projects/{p}/spec/deliverables   spec.forceDeliverable POST .../spec/deliverables/{key}/force
 */
export const DELIVERABLE_ROUTES = {
  list: (p: string) => `/projects/${p}/spec/deliverables`,
  force: (p: string, key: string) => `/projects/${p}/spec/deliverables/${key}/force`,
} as const;

export function deliverablesApi(app: INestApplication, actor: Pick<Actor, "cookie"> | undefined) {
  const cookie = actor?.cookie;
  return {
    list: (p: string) => send(app, cookie, "get", DELIVERABLE_ROUTES.list(p)),
    force: (p: string, key: string, over: Record<string, unknown> = {}) =>
      send(app, cookie, "post", DELIVERABLE_ROUTES.force(p, key), {
        projectId: p,
        key,
        confirm: true,
        ...over,
      }),
  };
}

/** Appel avec un jeton d'automatisation (`Authorization: Bearer`), sans cookie de session. */
export const forceWithBearer = (app: INestApplication, projectId: string, key: string) =>
  request(app.getHttpServer())
    .post(DELIVERABLE_ROUTES.force(projectId, key))
    .set("Authorization", "Bearer koklo-agent-token")
    .send({ projectId, key, confirm: true });

export interface OverrideRow {
  id: string;
  deliverable: string;
  forced_by: string;
}

export const overrideRows = (database: TestDatabase, projectId: string) =>
  database.query<OverrideRow>(
    "SELECT id, deliverable, forced_by FROM deliverable_overrides WHERE project_id = $1 ORDER BY deliverable",
    [projectId],
  );

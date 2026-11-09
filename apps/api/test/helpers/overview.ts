import { randomUUID } from "node:crypto";
import type { TestDatabase } from "@koklo/db/testing";
import type { INestApplication } from "@nestjs/common";
import { setKey } from "./ai-bench.ts";
import { makeSentinel } from "./llm-credentials.ts";
import type { Actor } from "./organizations.ts";
import { send, type World } from "./tickets.ts";

/** Procédures de la vue d'ensemble (TK-92, contrat 2.7.0) : appels HTTP réels d'un acteur. */
export function overviewApi(app: INestApplication, actor: Pick<Actor, "cookie"> | undefined) {
  const cookie = actor?.cookie;
  return {
    overview: (projectId: string) => send(app, cookie, "get", `/projects/${projectId}/overview`),
    activity: (projectId: string, query = "") =>
      send(app, cookie, "get", `/projects/${projectId}/activity${query}`),
  };
}

/** Pose une clé d'IA : l'organisation est « configurée » (la règle 1 de la prochaine étape se tait). */
export const keyed = async (app: INestApplication, world: World): Promise<World> => {
  await setKey(app, world, makeSentinel());
  return world;
};

export interface AuditSeed {
  action: string;
  actorKind?: "human" | "agent" | "runner" | "system";
  actorId?: string | null;
  targetKind?: string;
  targetId?: string;
  projectId?: string | null;
  occurredAt?: string;
}

/** Ligne du journal posée en SQL : le test choisit l'acteur et la date, sans passer par l'écriture métier. */
export async function insertAudit(
  database: TestDatabase,
  organizationId: string,
  seed: AuditSeed,
): Promise<string> {
  const id = randomUUID();
  await database.query(
    `INSERT INTO audit_log (id, organization_id, actor_kind, actor_id, action, target_kind, target_id,
                            project_id, occurred_at)
     VALUES ($1, $2, $3::audit_actor_kind, $4, $5, $6, $7, $8, COALESCE($9::timestamptz, now()))`,
    [
      id,
      organizationId,
      seed.actorKind ?? "human",
      seed.actorId ?? null,
      seed.action,
      seed.targetKind ?? "project",
      seed.targetId ?? randomUUID(),
      seed.projectId ?? null,
      seed.occurredAt ?? null,
    ],
  );
  return id;
}

/** `count` événements `idea.freeze` répartis dans le temps, du plus ancien au plus récent. */
export async function insertAuditBulk(
  database: TestDatabase,
  s: { organizationId: string; projectId: string },
  count: number,
  actorId: string,
): Promise<void> {
  await database.query(
    `INSERT INTO audit_log (id, organization_id, actor_kind, actor_id, action, target_kind, target_id,
                            project_id, occurred_at)
     SELECT gen_random_uuid(), $1, 'human', $3, 'idea.freeze', 'project', $2, $2,
            timestamptz '2026-01-01' + n * interval '1 minute'
       FROM generate_series(1, $4::int) AS n`,
    [s.organizationId, s.projectId, actorId, count],
  );
}

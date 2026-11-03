import type { TestDatabase } from "@koklo/db/testing";
import type { INestApplication } from "@nestjs/common";
import { createSpaceScene, type SpaceScene } from "./client-space.ts";
import type { Actor } from "./organizations.ts";
import type { RepoBench } from "./repo-scene.ts";
import { seedIndex } from "./spec-read.ts";
import { send } from "./tickets.ts";

/**
 * Client HTTP des cinq procédures `suggestion.*` du contrat 0.12.0 (fixé par
 * .workflow/TK-55c/03-red.md) :
 *  - create   POST /projects/{projectId}/suggestions                  { targetKind, targetRef?, body }
 *  - list     GET  /projects/{projectId}/suggestions?status&targetRef&limit&cursor
 *  - withdraw POST /projects/{projectId}/suggestions/{id}/withdraw
 *  - accept   POST /projects/{projectId}/suggestions/{id}/accept      { note? }
 *  - reject   POST /projects/{projectId}/suggestions/{id}/reject      { note? }
 */
export function suggestionApi(app: INestApplication, actor: Pick<Actor, "cookie"> | undefined) {
  const cookie = actor?.cookie;
  const base = (projectId: string) => `/projects/${projectId}/suggestions`;
  return {
    create: (projectId: string, over: Record<string, unknown> = {}) =>
      send(app, cookie, "post", base(projectId), {
        projectId,
        targetKind: "project",
        body: "Une idée pour le projet",
        ...over,
      }),
    createFeature: (projectId: string, targetRef: string, over: Record<string, unknown> = {}) =>
      send(app, cookie, "post", base(projectId), {
        projectId,
        targetKind: "feature",
        targetRef,
        body: "Une idée pour la feature",
        ...over,
      }),
    list: (projectId: string, query = "") => send(app, cookie, "get", `${base(projectId)}${query}`),
    withdraw: (projectId: string, id: string) =>
      send(app, cookie, "post", `${base(projectId)}/${id}/withdraw`, { projectId, id }),
    accept: (projectId: string, id: string, over: Record<string, unknown> = {}) =>
      send(app, cookie, "post", `${base(projectId)}/${id}/accept`, { projectId, id, ...over }),
    reject: (projectId: string, id: string, over: Record<string, unknown> = {}) =>
      send(app, cookie, "post", `${base(projectId)}/${id}/reject`, { projectId, id, ...over }),
  };
}

export interface SuggestionRow {
  id: string;
  organization_id: string;
  project_id: string;
  key: string;
  target_kind: string;
  target_ref: string | null;
  body: string;
  author_user_id: string | null;
  author_role: string | null;
  base_sha: string | null;
  status: string;
  decided_by_user_id: string | null;
  decided_at: Date | null;
  decision_note: string | null;
}

/** Suggestions d'un projet, de la plus ancienne à la plus récente. */
export function suggestionRows(database: TestDatabase, projectId: string) {
  return database.query<SuggestionRow>(
    `SELECT id, organization_id, project_id, key, target_kind, target_ref, body, author_user_id,
            author_role, base_sha, status, decided_by_user_id, decided_at, decision_note
       FROM suggestions WHERE project_id = $1 ORDER BY created_at, id`,
    [projectId],
  );
}

export interface NotificationRow {
  recipient_user_id: string;
  type: string;
  project_id: string | null;
  subject_kind: string;
  subject_ref: string;
  dedupe_key: string;
  email_state: string;
}

export function notificationRows(database: TestDatabase, organizationId: string) {
  return database.query<NotificationRow>(
    `SELECT recipient_user_id, type, project_id, subject_kind, subject_ref, dedupe_key, email_state
       FROM notifications WHERE organization_id = $1 ORDER BY created_at, id`,
    [organizationId],
  );
}

/**
 * Pose `count` suggestions (clés `SG-1..SG-count`) en SQL et aligne le compteur du projet : la
 * prochaine clé de l'API sera `SG-<count + 1>`. `authorUserId: null` : auteur effacé (RGPD).
 */
export async function seedSuggestions(
  database: TestDatabase,
  s: { organizationId: string; projectId: string },
  seed: {
    count: number;
    authorUserId: string | null;
    status?: "open" | "withdrawn";
    from?: number;
  },
): Promise<void> {
  const status = seed.status ?? "open";
  const from = seed.from ?? 1;
  await database.query(
    `INSERT INTO suggestions (id, organization_id, project_id, key, target_kind, target_ref, body,
                              author_user_id, author_role, status, decided_at, created_at, updated_at)
     SELECT gen_random_uuid(), $1, $2, 'SG-' || n, 'project', NULL, 'Idée ' || n, $3, 'client',
            $4::suggestion_status, CASE WHEN $4 = 'open' THEN NULL ELSE now() END, now(), now()
       FROM generate_series($6::int, $5::int) AS n`,
    [s.organizationId, s.projectId, seed.authorUserId, status, from + seed.count - 1, from],
  );
  await database.query(
    `INSERT INTO project_counters (organization_id, project_id, name, last_value, created_at, updated_at)
     VALUES ($1, $2, 'suggestion', $3, now(), now())
     ON CONFLICT (project_id, name) DO UPDATE SET last_value = GREATEST(project_counters.last_value, EXCLUDED.last_value)`,
    [s.organizationId, s.projectId, from + seed.count - 1],
  );
}

/**
 * Scène des suggestions : celle de l'espace client (p1 avec c1, p2 avec c2, c3 sans lien, organisation
 * étrangère) avec une spec indexée et committée par projet. F-001 et F-002 n'existent que dans p1
 * (et F-001 dans le projet étranger), F-009 que dans p2.
 */
export interface SuggestionScene extends SpaceScene {
  headP1: string;
  headP2: string;
}

export async function createSuggestionScene(bench: RepoBench): Promise<SuggestionScene> {
  const scene = await createSpaceScene(bench);
  const p1 = await seedIndex(
    bench,
    scene.p1,
    [
      { id: "F-001", titre: "Connexion" },
      { id: "F-002", titre: "Profil" },
    ],
    { commit: true },
  );
  const p2 = await seedIndex(bench, scene.p2, [{ id: "F-009", titre: "Facture" }], {
    commit: true,
  });
  await seedIndex(bench, scene.foreign, [{ id: "F-001", titre: "Etranger" }], { commit: true });
  return { ...scene, headP1: p1.sha, headP2: p2.sha };
}

/** Mots du vocabulaire technique interdit côté client (analyse TK-55 §4.3), en mots entiers. */
export const FORBIDDEN_WORDS = new Set([
  "git",
  "github",
  "commit",
  "sha",
  "branch",
  "merge",
  "pull",
  "repo",
  "tag",
  "diff",
  "path",
  "snapshot",
  "tables",
  "endpoints",
  "errorcode",
]);

const wordsOf = (text: string): string[] => [
  text.toLowerCase(),
  ...text
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/),
];

/** Clés (récursives) d'un corps JSON qui relèvent du vocabulaire interdit. */
export function forbiddenKeys(node: unknown, found: string[] = []): string[] {
  if (Array.isArray(node)) {
    for (const item of node) forbiddenKeys(item, found);
  } else if (node !== null && typeof node === "object") {
    for (const [key, value] of Object.entries(node)) {
      if (wordsOf(key).some((word) => FORBIDDEN_WORDS.has(word))) found.push(key);
      forbiddenKeys(value, found);
    }
  }
  return found;
}

/** Un SHA git en clair (40 ou 64 hex) quelque part dans la réponse. */
export const HAS_SHA = /\b[0-9a-f]{40}\b|\b[0-9a-f]{64}\b/;

export const UNKNOWN_ID = "11111111-1111-4111-8111-111111111111";

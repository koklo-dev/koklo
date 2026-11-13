import { randomUUID } from "node:crypto";
import { seedLarge } from "@koklo/db";
import type { TestDatabase } from "@koklo/db/testing";
import type { INestApplication } from "@nestjs/common";
import type { Actor } from "./organizations.ts";
import { send } from "./tickets.ts";

/**
 * Client HTTP des propositions de l'agent (TK-99a, contrat 2.9.0) :
 *  ai.proposeDeliverable POST /projects/{p}/ai/deliverable/propose   ai.proposeOptions GET .../ai/deliverable/options
 *  ai.reviseProposal POST .../ai/proposals/{id}/revise   proposal.list GET .../proposals
 *  proposal.decide POST .../proposals/{id}/decision   proposal.decideMany POST .../proposals/decisions
 */
export const PROPOSAL_ROUTES = {
  propose: (p: string) => `/projects/${p}/ai/deliverable/propose`,
  options: (p: string, deliverable = "functional") =>
    `/projects/${p}/ai/deliverable/options?deliverable=${deliverable}`,
  revise: (p: string, id: string) => `/projects/${p}/ai/proposals/${id}/revise`,
  list: (p: string, query: Record<string, string>) =>
    `/projects/${p}/proposals?${new URLSearchParams(query)}`,
  decide: (p: string, id: string) => `/projects/${p}/proposals/${id}/decision`,
  decideMany: (p: string) => `/projects/${p}/proposals/decisions`,
} as const;

export function proposalApi(app: INestApplication, actor: Pick<Actor, "cookie"> | undefined) {
  const cookie = actor?.cookie;
  return {
    propose: (p: string, over: Record<string, unknown> = {}) =>
      send(app, cookie, "post", PROPOSAL_ROUTES.propose(p), {
        projectId: p,
        deliverable: "functional",
        mode: "complete",
        ...over,
      }),
    options: (p: string, deliverable = "functional") =>
      send(app, cookie, "get", PROPOSAL_ROUTES.options(p, deliverable)),
    revise: (p: string, id: string, over: Record<string, unknown> = {}) =>
      send(app, cookie, "post", PROPOSAL_ROUTES.revise(p, id), {
        projectId: p,
        proposalId: id,
        instruction: "Plus court",
        ...over,
      }),
    list: (p: string, query: Record<string, string> = {}) =>
      send(
        app,
        cookie,
        "get",
        PROPOSAL_ROUTES.list(p, { deliverable: "functional", groupBy: "type_zone", ...query }),
      ),
    decide: (p: string, id: string, decision: string, over: Record<string, unknown> = {}) =>
      send(app, cookie, "post", PROPOSAL_ROUTES.decide(p, id), {
        projectId: p,
        proposalId: id,
        decision,
        ...over,
      }),
    decideMany: (p: string, over: Record<string, unknown>) =>
      send(app, cookie, "post", PROPOSAL_ROUTES.decideMany(p), {
        projectId: p,
        decision: "accept",
        ...over,
      }),
  };
}

/** Version `idea-vN` figée (commit réglé) : les pages et leur version au moment du gel. */
export const freezeIdea = (
  database: TestDatabase,
  scope: { organizationId: string; projectId: string },
  number = 1,
  pagesVersions: Record<string, number> = { vision: 1, personas: 1 },
  frozenAt: Date = new Date(),
) =>
  database.query(
    `INSERT INTO idea_versions (id, organization_id, project_id, number, tag, commit_sha, pages_versions, frozen_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, now())`,
    [
      randomUUID(),
      scope.organizationId,
      scope.projectId,
      number,
      `idea-v${number}`,
      "a".repeat(40),
      JSON.stringify(pagesVersions),
      frozenAt,
    ],
  );

/** Le jeu `seed:large` (400 propositions en 3 groupes de plus de 30, 1 000 fonctionnalités) dans le projet du monde. */
export const seedProposals = (
  database: TestDatabase,
  scope: { organizationId: string; projectId: string },
) => seedLarge(database.url, { target: scope });

export interface LaunchRow {
  id: string;
  status: string;
  deliverable: string;
  mode: string;
  error_code: string | null;
  base_version: number | null;
  sources: string[];
  instruction: string | null;
}

export const launchRows = (database: TestDatabase, projectId: string) =>
  database.query<LaunchRow>(
    `SELECT id, status, deliverable, mode, error_code, base_version, sources, instruction
       FROM agent_launches WHERE project_id = $1 ORDER BY created_at, id`,
    [projectId],
  );

/** Une proposition `feature` en attente, dans un lancement terminé du projet. */
export async function insertProposal(
  database: TestDatabase,
  scope: { organizationId: string; projectId: string; userId?: string },
  over: {
    launchId?: string;
    kind?: string;
    deliverable?: string;
    zone?: string;
    position?: number;
    status?: string;
    payload?: object;
    title?: string;
  } = {},
): Promise<{ id: string; launchId: string }> {
  const launchId = over.launchId ?? randomUUID();
  if (over.launchId === undefined) {
    await database.query(
      `INSERT INTO agent_launches (id, organization_id, project_id, deliverable, mode, status, requested_by, sources, updated_at)
       VALUES ($1, $2, $3, $5, 'complete', 'done', $4, '["idea.frozen"]'::jsonb, now())`,
      [
        launchId,
        scope.organizationId,
        scope.projectId,
        scope.userId ?? randomUUID(),
        over.deliverable ?? "functional",
      ],
    );
  }
  const id = randomUUID();
  await database.query(
    `INSERT INTO agent_proposals (id, organization_id, project_id, launch_id, deliverable, kind, zone, position, title, rationale, payload, status, updated_at)
     VALUES ($1, $2, $3, $4, $11, $5, $6, $7, $8, 'Absent du cahier', $9::jsonb, $10, now())`,
    [
      id,
      scope.organizationId,
      scope.projectId,
      launchId,
      over.kind ?? "feature",
      over.zone ?? "Réservations",
      over.position ?? 0,
      over.title ?? "Annuler une réservation",
      JSON.stringify(over.payload ?? FEATURE_CONTENT),
      over.status ?? "pending",
      over.deliverable ?? "functional",
    ],
  );
  return { id, launchId };
}

export const FEATURE_CONTENT = {
  title: "Annuler une réservation",
  priority: "should",
  description: "Annuler.",
  criteria: [
    {
      title: "Affichage de la liste",
      steps: [
        { type: "etant_donne", text: "un visiteur connecté" },
        { type: "quand", text: "il ouvre la liste" },
        { type: "alors", text: "il voit les éléments" },
      ],
    },
  ],
};

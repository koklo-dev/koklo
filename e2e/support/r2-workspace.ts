import { randomUUID } from "node:crypto";
import { type APIRequestContext, expect, request } from "@playwright/test";
import type pg from "pg";
import { insertMembership, insertSession, insertUser, SESSION_COOKIE, withClient } from "./db.ts";
import { type SeededInstallation, seedProviderInstallation } from "./installation.ts";

/**
 * Support e2e (pas du code de production) : espace de travail isolé des parcours R2 (TK-49b).
 * Une organisation au slug unique, une installation GitHub active graine (le faux l'accepte), un owner,
 * un dev, un business (lecture de la spec, aucune écriture) et un client (cloisonné par projet, TK-55a), chacun avec une vraie session Better Auth.
 * Aucun projet : c'est l'UI ou l'API du test qui le crée.
 */
export { SESSION_COOKIE };

export interface R2Member {
  userId: string;
  role: "owner" | "dev" | "business" | "client";
  /** `members.id`, attendu par `projectClient.add`. */
  memberId: string;
  cookie: string;
}

export interface R2Workspace {
  organizationId: string;
  slug: string;
  installation: SeededInstallation;
  owner: R2Member;
  dev: R2Member;
  business: R2Member;
  client: R2Member;
}

async function insertMember(
  client: pg.Client,
  organizationId: string,
  role: R2Member["role"],
): Promise<R2Member> {
  const userId = await insertUser(client, {
    email: `r2-${role}-${randomUUID()}@example.com`,
    name: `R2 ${role}`,
  });
  const memberId = await insertMembership(client, organizationId, userId, role);
  return { userId, role, memberId, cookie: await insertSession(client, userId, organizationId) };
}

export function createR2Workspace(): Promise<R2Workspace> {
  const organizationId = randomUUID();
  const slug = `r2-${randomUUID().slice(0, 8)}`;
  return withClient(async (client) => {
    await client.query(
      `INSERT INTO organizations (id, name, slug, created_at, updated_at)
       VALUES ($1, $2, $3, now(), now())`,
      [organizationId, `Organisation R2 ${slug}`, slug],
    );
    const installation = await seedProviderInstallation(client, {
      organizationId,
      ownerLogin: slug,
    });
    const owner = await insertMember(client, organizationId, "owner");
    const dev = await insertMember(client, organizationId, "dev");
    const business = await insertMember(client, organizationId, "business");
    const reader = await insertMember(client, organizationId, "client");
    return { organizationId, slug, installation, owner, dev, business, client: reader };
  });
}

/** Contexte HTTP authentifié (cookie de session) sur le web, chemin de production vers l'API. */
export function apiAs(baseURL: string, member: R2Member): Promise<APIRequestContext> {
  return request.newContext({
    baseURL,
    extraHTTPHeaders: { cookie: `${SESSION_COOKIE}=${member.cookie}` },
  });
}

export const ORPC = "/api/orpc";

export interface SpecRepo {
  id: string;
  role: string;
  mode: string;
  name: string;
  ownerLogin: string;
  defaultBranch: string;
  externalId?: string;
}

/** Crée un projet puis son dépôt de spec par l'API (hors UI), pour les tests qui ne portent pas sur la création. */
export async function createProjectWithSpecRepo(
  owner: APIRequestContext,
  workspace: R2Workspace,
  name: string,
): Promise<{ projectId: string; repoExternalId: number }> {
  const created = await owner.post(`${ORPC}/projects`, { data: { name } });
  expect(created.ok(), await created.text()).toBe(true);
  const { id: projectId } = (await created.json()) as { id: string };
  const spec = await owner.post(`${ORPC}/projects/${projectId}/spec-repo`, {
    data: { installationId: workspace.installation.id },
  });
  expect(spec.ok(), await spec.text()).toBe(true);
  return { projectId, repoExternalId: await repoExternalId(projectId) };
}

/** `project_repos.external_id` : `repository.id` des webhooks (entier, `nextId` du lanceur). */
export function repoExternalId(projectId: string): Promise<number> {
  return withClient(async (client) => {
    const { rows } = await client.query<{ external_id: string }>(
      "SELECT external_id FROM project_repos WHERE project_id = $1 AND role = 'spec'",
      [projectId],
    );
    expect(rows).toHaveLength(1);
    return Number(rows[0]?.external_id);
  });
}

/** Lie un client à un projet par l'API (`projectClient.add`, owner/admin), comme en production. */
export async function linkClientToProject(
  owner: APIRequestContext,
  projectId: string,
  member: R2Member,
): Promise<void> {
  const linked = await owner.post(`${ORPC}/projects/${projectId}/clients`, {
    data: { memberId: member.memberId },
  });
  expect(linked.ok(), await linked.text()).toBe(true);
}

import { randomUUID } from "node:crypto";
import type pg from "pg";
import { insertMembership, insertSession, insertUser, SESSION_COOKIE, withClient } from "./db.ts";

/**
 * Support e2e (pas du code de production) : espace de travail isolé du scénario R1.
 * Une organisation au slug unique par exécution, son projet, un owner et deux membres `dev`,
 * chacun avec une vraie session Better Auth. Rien n'est lu ni modifié dans le seed : le sprint créé
 * par le test est donc `SP-1` de CE projet, sans collision avec `kanban.spec.ts`.
 */

export interface R1Member {
  userId: string;
  email: string;
  role: "owner" | "dev";
  /** Valeur du cookie `better-auth.session_token` (signée, encodée). */
  cookie: string;
}

export interface R1Workspace {
  organizationId: string;
  slug: string;
  projectId: string;
  owner: R1Member;
  devs: readonly [R1Member, R1Member];
}

export { SESSION_COOKIE };

async function insertMember(
  client: pg.Client,
  organizationId: string,
  role: R1Member["role"],
  suffix: string,
): Promise<R1Member> {
  const email = `r1-${suffix}-${randomUUID()}@example.com`;
  const userId = await insertUser(client, { email, name: `R1 ${suffix}` });
  await insertMembership(client, organizationId, userId, role);
  const cookie = await insertSession(client, userId, organizationId);
  return { userId, email, role, cookie };
}

export async function createR1Workspace(): Promise<R1Workspace> {
  const organizationId = randomUUID();
  const projectId = randomUUID();
  const slug = `r1-${randomUUID().slice(0, 8)}`;
  return withClient(async (client) => {
    await client.query(
      `INSERT INTO organizations (id, name, slug, created_at, updated_at)
       VALUES ($1, $2, $3, now(), now())`,
      [organizationId, `Organisation R1 ${slug}`, slug],
    );
    await client.query(
      `INSERT INTO projects (id, organization_id, name, created_at, updated_at)
       VALUES ($1, $2, $3, now(), now())`,
      [projectId, organizationId, `Projet R1 ${slug}`],
    );
    const owner = await insertMember(client, organizationId, "owner", "owner");
    const devA = await insertMember(client, organizationId, "dev", "dev-a");
    const devB = await insertMember(client, organizationId, "dev", "dev-b");
    return { organizationId, slug, projectId, owner, devs: [devA, devB] };
  });
}

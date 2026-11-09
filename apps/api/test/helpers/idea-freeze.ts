import type { TestDatabase } from "@koklo/db/testing";
import type { INestApplication } from "@nestjs/common";
import type { AiBench } from "./ai-bench.ts";
import type { IdeaWorld } from "./idea-agent.ts";
import type { Actor } from "./organizations.ts";
import { insertInstallation, repoApi } from "./repos.ts";
import { operationRows } from "./spec-batch.ts";
import { send } from "./tickets.ts";

/**
 * Client HTTP du passage au cadrage (TK-91, contrat 2.6.0) :
 *  freeze POST /projects/{p}/idea/freeze   synthesis GET /projects/{p}/idea/synthesis
 *  regenerate POST /projects/{p}/ai/idea/synthesis
 */
export function freezeApi(app: INestApplication, actor: Pick<Actor, "cookie"> | undefined) {
  const cookie = actor?.cookie;
  return {
    freeze: (p: string, idempotencyKey: string) =>
      send(app, cookie, "post", `/projects/${p}/idea/freeze`, { projectId: p, idempotencyKey }),
    synthesis: (p: string) => send(app, cookie, "get", `/projects/${p}/idea/synthesis`),
    regenerate: (p: string) =>
      send(app, cookie, "post", `/projects/${p}/ai/idea/synthesis`, { projectId: p }),
  };
}

/** Dossier d'idée (10 pages) d'un projet neuf, avec dépôt de spec ; les 4 pages requises sont stables par défaut. */
export async function framingProject(
  b: AiBench,
  world: IdeaWorld,
  options: { stable?: boolean } = {},
) {
  const project = await world.fresh();
  const installation = await insertInstallation(b.database, world.scene.organizationId);
  const created = await repoApi(b.app, world.scene.staff.owner).createSpec(
    project.projectId,
    installation.id,
  );
  if (created.status !== 200) throw new Error(`createSpec : ${JSON.stringify(created.body)}`);
  if (options.stable !== false) await makeRequiredStable(b.database, project.projectId);
  return project;
}

export const makeRequiredStable = (database: TestDatabase, projectId: string) =>
  database.query(
    `UPDATE idea_pages SET status = 'stable', content_md = 'Contenu de ' || title, version = version + 1
      WHERE project_id = $1 AND required AND deleted_at IS NULL`,
    [projectId],
  );

export interface VersionRow {
  id: string;
  number: number;
  tag: string;
  batch_id: string | null;
  commit_sha: string | null;
  pages_versions: Record<string, number>;
  frozen_by: string | null;
}

export const versionRows = (database: TestDatabase, projectId: string) =>
  database.query<VersionRow>(
    `SELECT id, number, tag, batch_id, commit_sha, pages_versions, frozen_by
       FROM idea_versions WHERE project_id = $1 ORDER BY number`,
    [projectId],
  );

export interface SynthesisRow {
  content_md: string;
  source: string | null;
  generated_at: Date;
}

export const synthesisRows = (database: TestDatabase, projectId: string) =>
  database.query<SynthesisRow>(
    "SELECT content_md, source, generated_at FROM idea_synthesis WHERE project_id = $1",
    [projectId],
  );

/** Simule le worker : le lot est commité (et, si `failed`, échoué) ; la version suit à la lecture suivante. */
export const settleBatch = (
  database: TestDatabase,
  batchId: string,
  status: "committed" | "failed" | "conflict",
  sha = "e".repeat(40),
) =>
  database.query(
    `UPDATE spec_write_batches
        SET status = $2::write_batch_status, commit_sha = $3, committed_at = $4, error_code = $5
      WHERE id = $1`,
    [
      batchId,
      status,
      status === "committed" ? sha : null,
      status === "committed" ? new Date() : null,
      status === "committed" ? null : status === "failed" ? "INTERNAL" : "write_conflict",
    ],
  );

export const kindsOf = async (database: TestDatabase, batchId: string) =>
  (await operationRows(database, batchId)).map((row) => row.kind);

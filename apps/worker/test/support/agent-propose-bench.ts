import { randomUUID } from "node:crypto";
import {
  AGENT_PROPOSE_QUEUE,
  type AiProvider,
  type AiRequest,
  type AiResponse,
} from "@koklo/domain";
import { vi } from "vitest";
import type { Scene, WorkerBench } from "./spec-write-bench.ts";

/**
 * Banc de la génération de propositions (TK-99a lot B) : le vrai worker et pg-boss sur Postgres éphémère, un faux
 * `AiProvider` espionné à la place du moteur (aucun fournisseur réel, aucune clé).
 */
export const feature = (title: string, over: Record<string, unknown> = {}) => ({
  kind: "feature",
  rationale: "Absent du cahier",
  content: {
    title,
    priority: "should",
    description: "Description.",
    criteria: [
      {
        title: "Cas nominal",
        steps: [
          { type: "etant_donne", text: "Un compte" },
          { type: "quand", text: "Il agit" },
          { type: "alors", text: "C'est fait" },
        ],
      },
    ],
    ...over,
  },
});

type BatchReply = (call: number, request: AiRequest) => unknown | Promise<unknown>;

export class FakeAi implements AiProvider {
  requests: AiRequest[] = [];
  zones: string[] = ["Accès", "Facturation"];
  failWith: unknown;
  batch: BatchReply = (call) => ({ proposals: [feature(`Fonction ${call}`)] });

  reset(): void {
    this.requests = [];
    this.zones = ["Accès", "Facturation"];
    this.failWith = undefined;
    this.batch = (call) => ({ proposals: [feature(`Fonction ${call}`)] });
  }

  async preflight(): Promise<void> {}

  async complete(request: AiRequest): Promise<AiResponse> {
    this.requests.push(request);
    if (this.failWith !== undefined) throw this.failWith;
    const batches = this.requests.filter((r) => r.trace.purpose === "proposal-batch").length;
    const output =
      request.trace.purpose === "proposal-zones"
        ? { zones: this.zones }
        : await this.batch(batches, request);
    return {
      output,
      stop: "end",
      usage: { inputTokens: 10, outputTokens: 10 },
      provider: "anthropic",
      model: "modele-de-test",
    } as unknown as AiResponse;
  }

  stream(): never {
    throw new Error("non utilisé");
  }

  /** Texte intégral envoyé au modèle (consigne et données) lors de tous les appels. */
  sent(): string {
    return this.requests.map((r) => `${r.prompt.system}\n${r.prompt.user}`).join("\n");
  }
}

export interface Seeded {
  readonly scene: Scene;
  readonly launchId: string;
}

/** Cadrage figé (`idea-v1`) : pages, synthèse publiée, cahier de deux fonctionnalités dont une sans critère. */
export async function seedProject(bench: WorkerBench, scene: Scene): Promise<void> {
  const q = (sql: string, params: unknown[]) => bench.query(sql, params);
  const { organizationId: org, projectId: project } = scene;
  await q(
    `INSERT INTO members (id, organization_id, user_id, role, created_at, updated_at)
     VALUES ($1, $2, $3, 'dev', now(), now())`,
    [randomUUID(), org, scene.userId],
  );
  const pages: [string, string, number, string][] = [
    ["vision", "Vision", 1, "FROZEN-VISION texte gelé"],
    ["personas", "Personas", 1, "FROZEN-PERSONAS texte gelé"],
    ["hypotheses-risques", "Hypothèses et risques", 1, "RISK-OK texte gelé"],
    ["perimetre", "Périmètre", 2, "SECRET-PAGE-MODIFIEE après le gel"],
  ];
  for (const [position, [slug, title, version, content]] of pages.entries()) {
    await q(
      `INSERT INTO idea_pages (id, organization_id, project_id, slug, title, position, required, origin,
                               template_key, status, content_md, version, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, false, 'template', $4, 'draft', $7, $8, now())`,
      [randomUUID(), org, project, slug, title, position, content, version],
    );
  }
  await q(
    `INSERT INTO idea_versions (id, organization_id, project_id, number, tag, commit_sha, pages_versions, frozen_at, updated_at)
     VALUES ($1, $2, $3, 1, 'idea-v1', $4, $5::jsonb, now(), now())`,
    [
      randomUUID(),
      org,
      project,
      "a".repeat(40),
      JSON.stringify({ vision: 1, personas: 1, "hypotheses-risques": 1, perimetre: 1 }),
    ],
  );
  await q(
    `INSERT INTO idea_synthesis (id, organization_id, project_id, content_md, source, generated_at, updated_at)
     VALUES ($1, $2, $3, 'SYNTH-OK synthèse publiée', 'idea-v1', now(), now())`,
    [randomUUID(), org, project],
  );
  await q(
    `INSERT INTO idea_messages (id, organization_id, project_id, author, author_user_id, mode, text, updated_at)
     VALUES ($1, $2, $3, 'human', $4, 'free', 'SECRET-COMMENTAIRE du fil', now())`,
    [randomUUID(), org, project, scene.userId],
  );
  await seedSpec(bench, scene);
}

async function seedSpec(bench: WorkerBench, scene: Scene): Promise<void> {
  const snapshotId = randomUUID();
  const org = scene.organizationId;
  await bench.query(
    `INSERT INTO spec_snapshots (id, organization_id, repo_id, commit_sha, status, updated_at)
     VALUES ($1, $2, $3, $4, 'ready', now())`,
    [snapshotId, org, scene.repoId, "b".repeat(40)],
  );
  await bench.query(
    `INSERT INTO spec_heads (organization_id, repo_id, branch, snapshot_id, updated_at)
     VALUES ($1, $2, 'cadrage', $3, now())`,
    [org, scene.repoId, snapshotId],
  );
  for (const [specId, title] of [
    ["F-001", "Connexion"],
    ["F-002", "Export"],
  ] as const) {
    const featureId = randomUUID();
    await bench.query(
      `INSERT INTO spec_features (id, organization_id, snapshot_id, spec_id, title, status, priority, file_path, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'brouillon', 'should', $6, now())`,
      [featureId, org, snapshotId, specId, title, `features/${specId}.md`],
    );
    if (specId === "F-001") {
      await bench.query(
        `INSERT INTO spec_criteria (id, organization_id, feature_id, spec_id, position, title, updated_at)
         VALUES ($1, $2, $3, 'AC-1', 1, 'CRITERE-EXISTANT', now())`,
        [randomUUID(), org, featureId],
      );
    }
  }
}

/** Projet voisin : une page gelée et une synthèse qui ne doivent jamais atteindre le modèle. */
export async function seedOtherProject(bench: WorkerBench, scene: Scene): Promise<void> {
  const other = randomUUID();
  await bench.query(
    "INSERT INTO projects (id, organization_id, name, created_at, updated_at) VALUES ($1, $2, 'Autre', now(), now())",
    [other, scene.organizationId],
  );
  await bench.query(
    `INSERT INTO idea_pages (id, organization_id, project_id, slug, title, position, required, origin,
                             template_key, status, content_md, version, updated_at)
     VALUES ($1, $2, $3, 'vision', 'Vision', 0, false, 'template', 'vision', 'draft', 'SECRET-AUTRE-PROJET', 1, now())`,
    [randomUUID(), scene.organizationId, other],
  );
}

export interface LaunchOver {
  status?: string;
  mode?: string;
  lastSeenAt?: string | null;
  heartbeatAt?: string;
  instruction?: string | null;
  /** Version d'idée lue par le lancement (1 par défaut). */
  baseVersion?: number;
}

/** Lancement `queued` posé comme l'API (SQL), puis enfilé `{ launchId }` seul. */
export async function launch(
  bench: WorkerBench,
  scene: Scene,
  over: LaunchOver = {},
): Promise<string> {
  const id = randomUUID();
  await bench.query(
    `INSERT INTO agent_launches (id, organization_id, project_id, deliverable, mode, instruction, status, requested_by,
                                 sources, base_version, last_seen_at, heartbeat_at, updated_at)
     VALUES ($1, $2, $3, 'functional', $4, $5, $6, $7, '["idea.frozen"]'::jsonb, $10, $8, COALESCE($9::timestamptz, now()), now())`,
    [
      id,
      scene.organizationId,
      scene.projectId,
      over.mode ?? "complete",
      over.instruction ?? null,
      over.status ?? "queued",
      scene.userId,
      over.lastSeenAt ?? null,
      over.heartbeatAt ?? null,
      over.baseVersion ?? 1,
    ],
  );
  const worker = bench.worker;
  if (!worker) throw new Error("worker non démarré");
  await worker.boss.send(AGENT_PROPOSE_QUEUE, { launchId: id }, { id, singletonKey: id });
  return id;
}

export interface LaunchState {
  status: string;
  error_code: string | null;
  proposed_count: number;
  discarded_count: number;
  heartbeat_at: Date;
  finished_at: Date | null;
}

export const launchState = async (bench: WorkerBench, id: string): Promise<LaunchState> => {
  const [row] = await bench.query<LaunchState>(
    `SELECT status, error_code, proposed_count, discarded_count, heartbeat_at, finished_at
       FROM agent_launches WHERE id = $1`,
    [id],
  );
  if (!row) throw new Error("lancement absent");
  return row;
};

/** Attend la fin du lancement (`done` ou `failed`). */
export const finished = (bench: WorkerBench, id: string, timeout = 15_000) =>
  vi.waitFor(
    async () => {
      const row = await launchState(bench, id);
      if (row.status === "queued" || row.status === "running") {
        throw new Error(`lancement non terminé (${row.status})`);
      }
      return row;
    },
    { timeout, interval: 100 },
  );

export const proposalsOf = (bench: WorkerBench, launchId: string) =>
  bench.query<{
    kind: string;
    zone: string;
    position: number;
    title: string;
    status: string;
    rationale: string;
    payload: Record<string, unknown>;
  }>(
    `SELECT kind, zone, position, title, status, rationale, payload
       FROM agent_proposals WHERE launch_id = $1 ORDER BY position`,
    [launchId],
  );

/**
 * `idea-v2` après `idea-v1` : la vision est modifiée, la page « annexes » ajoutée, les personas et les risques inchangés
 * (leur texte ne doit jamais atteindre le modèle en mode `update`).
 */
export async function seedIdeaV2(bench: WorkerBench, scene: Scene): Promise<void> {
  const { organizationId: org, projectId: project } = scene;
  await bench.query(
    "UPDATE idea_pages SET content_md = 'VISION-V2 texte modifie', version = 2 WHERE project_id = $1 AND slug = 'vision'",
    [project],
  );
  await bench.query(
    `INSERT INTO idea_pages (id, organization_id, project_id, slug, title, position, required, origin,
                             template_key, status, content_md, version, updated_at)
     VALUES ($1, $2, $3, 'annexes', 'Annexes', 9, false, 'template', 'annexes', 'draft', 'ANNEXE-V2 nouvelle page', 1, now())`,
    [randomUUID(), org, project],
  );
  await bench.query(
    `INSERT INTO idea_versions (id, organization_id, project_id, number, tag, commit_sha, pages_versions, frozen_at, updated_at)
     VALUES ($1, $2, $3, 2, 'idea-v2', $4, $5::jsonb, now(), now())`,
    [
      randomUUID(),
      org,
      project,
      "c".repeat(40),
      JSON.stringify({ vision: 2, personas: 1, "hypotheses-risques": 1, perimetre: 1, annexes: 1 }),
    ],
  );
}

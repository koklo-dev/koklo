import { randomUUID } from "node:crypto";
import type { TestDatabase } from "@koklo/db/testing";
import type { LlmProvider, LlmRequest, LlmResponse, LlmStreamEvent } from "@koklo/domain";
import { FakeLlm } from "@koklo/domain/testing";
import type { INestApplication } from "@nestjs/common";
import { type AiBench, installAiBench } from "./ai-bench.ts";
import { type ClientScene, createClientScene, linkClient } from "./client-scene.ts";
import { pageIdOf, seedIdeaTemplate } from "./idea.ts";
import { makeSentinel } from "./llm-credentials.ts";
import type { Actor } from "./organizations.ts";
import { send } from "./tickets.ts";

/**
 * Banc de l'agent de l'espace Idée (TK-90, contrat 2.5.0). Routes :
 *  chat POST /projects/{p}/ai/idea/chat (SSE)   gaps POST /projects/{p}/ai/idea/gaps
 *  status GET /projects/{p}/idea/agent          messages GET /projects/{p}/idea/messages
 *  decide POST /projects/{p}/idea/proposals/{id}/decision   undo POST .../undo
 * Le modèle est un `FakeLlm` (jamais le réseau) ; l'évènement d'erreur d'un flux porte le code du contrat.
 */
export function ideaAgentApi(app: INestApplication, actor: Pick<Actor, "cookie"> | undefined) {
  const cookie = actor?.cookie;
  const idea = (p: string) => `/projects/${p}/idea`;
  return {
    chat: (p: string, body: Record<string, unknown>) =>
      send(app, cookie, "post", `/projects/${p}/ai/idea/chat`, { projectId: p, ...body }),
    gaps: (p: string) => send(app, cookie, "post", `/projects/${p}/ai/idea/gaps`, { projectId: p }),
    status: (p: string) => send(app, cookie, "get", `${idea(p)}/agent`),
    messages: (p: string, query = "") =>
      send(app, cookie, "get", `${idea(p)}/messages${query === "" ? "" : `?${query}`}`),
    decide: (p: string, id: string, decision: "accept" | "reject", contentMd?: string) =>
      send(app, cookie, "post", `${idea(p)}/proposals/${id}/decision`, {
        projectId: p,
        proposalId: id,
        decision,
        ...(contentMd === undefined ? {} : { contentMd }),
      }),
    undo: (p: string, id: string) =>
      send(app, cookie, "post", `${idea(p)}/proposals/${id}/undo`, {
        projectId: p,
        proposalId: id,
      }),
  };
}

export interface SseEvent {
  event: string;
  data: Record<string, unknown> | undefined;
}

/** Évènements d'une réponse `text/event-stream` (évènement `message`, `done` de fin ou `error`). */
export function sseEvents(text: string): SseEvent[] {
  return text
    .split("\n\n")
    .filter((block) => block.trim() !== "")
    .map((block) => {
      const lines = block.split("\n");
      const event =
        lines
          .find((l) => l.startsWith("event:"))
          ?.slice(6)
          .trim() ?? "message";
      const raw = lines
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).trim())
        .join("\n");
      return { event, data: raw === "" ? undefined : JSON.parse(raw) };
    });
}

/** Les charges utiles `{ type, ... }` du flux, dans l'ordre. */
export const chatEvents = (text: string) =>
  sseEvents(text).filter((e) => e.event === "message" && e.data?.type !== undefined);
export const streamedText = (text: string) =>
  chatEvents(text)
    .filter((e) => e.data?.type === "text")
    .map((e) => String(e.data?.text))
    .join("");
export const errorOf = (text: string) => sseEvents(text).find((e) => e.event === "error")?.data;

export interface IdeaWorld {
  scene: ClientScene;
  key: string;
  /** Projet neuf de l'organisation (10 pages, c1 lié), pages par slug. */
  fresh(): Promise<{ projectId: string; page: (slug: string) => Promise<string> }>;
}

let counter = 0;

/** Scène de rôles + clé BYOK posée par l'owner, sur la base du banc d'IA. */
export async function createIdeaWorld(b: AiBench): Promise<IdeaWorld> {
  const scene = await createClientScene(b.database);
  const key = makeSentinel();
  const set = await send(b.app, scene.staff.owner.cookie, "put", "/llm-credentials/anthropic", {
    provider: "anthropic",
    apiKey: key,
  });
  if (set.status !== 200) throw new Error(`set : ${JSON.stringify(set.body)}`);
  return {
    scene,
    key,
    fresh: async () => {
      counter += 1;
      const projectId = randomUUID();
      await b.database.query(
        "INSERT INTO projects (id, organization_id, name, created_at, updated_at) VALUES ($1, $2, $3, now(), now())",
        [projectId, scene.organizationId, `Projet Cèdre ${counter}`],
      );
      await seedIdeaTemplate(b.database, { organizationId: scene.organizationId, projectId });
      await linkClient(b.database, scene.organizationId, projectId, scene.c1.userId);
      return { projectId, page: (slug: string) => pageIdOf(b.database, projectId, slug) };
    },
  };
}

export interface IdeaAgentBench {
  bench: () => AiBench;
  world: () => IdeaWorld;
}

/** Banc d'IA + monde de l'espace Idée, à appeler au niveau du fichier de test. */
export function installIdeaAgent(hooks: {
  beforeAll: (fn: () => Promise<void>, timeout?: number) => void;
  afterAll: (fn: () => Promise<void>, timeout?: number) => void;
  beforeEach: (fn: () => Promise<void>) => void;
}): IdeaAgentBench {
  const bench = installAiBench(hooks);
  let world: IdeaWorld | undefined;
  hooks.beforeAll(async () => {
    world = await createIdeaWorld(bench());
  }, 180_000);
  return {
    bench,
    world: () => {
      if (!world) throw new Error("monde non initialisé");
      return world;
    },
  };
}

// --- Réponses simulées du modèle ---
export const CHAT_TEXT = "Pour qui est ce produit, et quel problème résout-il ?";
export const proposalReply = (...proposals: Record<string, unknown>[]) => ({ proposals });
export const aProposal = (over: Record<string, unknown> = {}) => ({
  op: "append",
  anchorBlockIndex: null,
  rangeEnd: null,
  title: null,
  contentMd: "Le produit aide les équipes à cadrer une idée.",
  rationale: "La vision ne dit pas encore à quoi sert le produit.",
  ...over,
});

/** Modèle simulé : texte pour le flux, JSON pour les propositions et les manques, selon la finalité. */
export function scripted(
  opts: { text?: string; proposals?: unknown; gaps?: unknown } = {},
): FakeLlm {
  const fake = new FakeLlm();
  const when = (purpose: string) => (call: { trace: { purpose: string } }) =>
    call.trace.purpose === purpose;
  const always = (purpose: string, reply: unknown) => {
    // Une étape par appel prévu : le faux ne rend jamais deux fois la même, sauf script permanent.
    for (let i = 0; i < 20; i += 1) fake.script([{ reply, when: when(purpose) }]);
  };
  always("idea-chat", opts.text ?? CHAT_TEXT);
  always("idea-propose", opts.proposals ?? proposalReply(aProposal()));
  always(
    "idea-gaps",
    opts.gaps ?? { items: [{ page: "Vision", text: "Le public visé n'est pas dit." }] },
  );
  return fake;
}

export const purposes = (fake: FakeLlm) => fake.calls.map((c) => c.trace.purpose);

/** Tout ce qui part vers le modèle pour un appel (consigne et données). */
export const payloadOf = (fake: FakeLlm, index = 0) => {
  const call = fake.calls[index];
  if (!call) throw new Error("aucun appel");
  return `${call.prompt.system}\n${call.prompt.user}`;
};

/** Modèle dont le premier flux attend `release()` : le verrou reste pris le temps du test. */
export class BlockingStreamLlm implements LlmProvider {
  readonly id = "fake" as const;
  started = 0;
  private open: () => void = () => undefined;
  private readonly gate = new Promise<void>((resolve) => {
    this.open = resolve;
  });

  constructor(private readonly inner: FakeLlm) {}

  complete(request: LlmRequest): Promise<LlmResponse> {
    return this.inner.complete(request);
  }

  async *stream(request: LlmRequest): AsyncGenerator<LlmStreamEvent> {
    this.started += 1;
    if (this.started === 1) await this.gate;
    yield* this.inner.stream(request);
  }

  release(): void {
    this.open();
  }

  async untilStarted(count = 1): Promise<void> {
    const deadline = Date.now() + 10_000;
    while (this.started < count) {
      if (Date.now() > deadline) throw new Error("le flux n'a pas démarré");
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
}

// --- Lectures et écritures en base ---
export interface ProposalRow {
  id: string;
  page_id: string | null;
  op: string;
  anchor_block_index: number | null;
  range_end: number | null;
  title: string | null;
  content_md: string;
  base_version: number | null;
  status: string;
  decided_by: string | null;
  previous_content_md: string | null;
  result_version: number | null;
  created_page_id: string | null;
}

export const proposalRows = (database: TestDatabase, projectId: string) =>
  database.query<ProposalRow>(
    `SELECT id, page_id, op::text AS op, anchor_block_index, range_end, title, content_md, base_version,
            status::text AS status, decided_by, previous_content_md, result_version, created_page_id
       FROM idea_proposals WHERE project_id = $1 ORDER BY created_at, id`,
    [projectId],
  );

export const countOf = async (database: TestDatabase, sql: string, params: unknown[]) =>
  Number((await database.query<{ n: number }>(sql, params))[0]?.n ?? -1);

/** Pages, contenus et versions d'un projet : ce qu'une proposition ne doit jamais toucher sans décision. */
export const pagesSnapshot = (database: TestDatabase, projectId: string) =>
  database.query<{ id: string; content_md: string; version: number }>(
    "SELECT id, content_md, version FROM idea_pages WHERE project_id = $1 ORDER BY id",
    [projectId],
  );

export async function insertMessage(
  database: TestDatabase,
  s: { organizationId: string; projectId: string },
  over: { pageId?: string | null; userId?: string | null; text?: string; mode?: string } = {},
): Promise<string> {
  const id = randomUUID();
  const human = over.userId !== null && over.userId !== undefined;
  await database.query(
    `INSERT INTO idea_messages (id, organization_id, project_id, page_id, author_user_id, author, mode, text, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6::idea_message_author, $7::idea_message_mode, $8, now())`,
    [
      id,
      s.organizationId,
      s.projectId,
      over.pageId ?? null,
      human ? over.userId : null,
      human ? "human" : "agent",
      over.mode ?? "interview",
      over.text ?? "Message",
    ],
  );
  return id;
}

export interface SeedProposal {
  op?: string;
  pageId?: string | null;
  baseVersion?: number | null;
  anchor?: number | null;
  rangeEnd?: number | null;
  title?: string | null;
  afterPageId?: string | null;
  contentMd?: string;
  status?: string;
  rationale?: string;
}

/** Proposition en attente insérée en SQL (les tests de décision ne dépendent pas du chat). */
export async function insertProposal(
  database: TestDatabase,
  s: { organizationId: string; projectId: string },
  over: SeedProposal = {},
): Promise<string> {
  const op = over.op ?? "append";
  const messageId = await insertMessage(database, s, { userId: null });
  const id = randomUUID();
  await database.query(
    `INSERT INTO idea_proposals (id, organization_id, project_id, page_id, message_id, op, anchor_block_index,
                                 range_end, title, after_page_id, content_md, rationale, base_version, status, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6::idea_proposal_op, $7, $8, $9, $10, $11, $12, $13, $14::idea_proposal_status, now())`,
    [
      id,
      s.organizationId,
      s.projectId,
      op === "create_page" ? null : (over.pageId ?? null),
      messageId,
      op,
      over.anchor ?? null,
      over.rangeEnd ?? null,
      op === "create_page" ? (over.title ?? "Concurrence") : null,
      over.afterPageId ?? null,
      over.contentMd ?? "Texte proposé.",
      over.rationale ?? "Parce que.",
      op === "create_page" ? null : (over.baseVersion ?? 1),
      over.status ?? "pending",
    ],
  );
  return id;
}

export const setContent = (
  database: TestDatabase,
  pageId: string,
  contentMd: string,
  version = 1,
) =>
  database.query(
    "UPDATE idea_pages SET content_md = $2, version = $3, status = 'draft' WHERE id = $1",
    [pageId, contentMd, version],
  );

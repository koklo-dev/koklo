import { vi } from "vitest";

/** Procédures simulées de l'agent de l'espace Idée (TK-90) : jamais d'appel réel. */
export const agentMocks = {
  status: vi.fn(),
  messages: vi.fn(),
  chat: vi.fn(),
  gaps: vi.fn(),
  decide: vi.fn(),
  undo: vi.fn(),
  getPage: vi.fn(),
  list: vi.fn(),
};

const q = (name: string, fn: (input?: unknown) => unknown) => ({
  queryOptions: ({ input }: { input?: unknown } = {}) => ({
    queryKey: [name, input ?? null],
    queryFn: () => fn(input),
  }),
  call: (input?: unknown) => fn(input),
});

export const fakeOrpc = () => ({
  orpc: {
    idea: {
      agent: { status: q("agent-status", agentMocks.status) },
      message: { list: q("messages", agentMocks.messages) },
      get: q("page", agentMocks.getPage),
      list: q("list", agentMocks.list),
      proposal: {
        decide: { call: (input: unknown) => agentMocks.decide(input) },
        undo: { call: (input: unknown) => agentMocks.undo(input) },
      },
    },
    ai: {
      ideaChat: { call: (input: unknown, options?: unknown) => agentMocks.chat(input, options) },
      ideaGaps: { call: (input: unknown) => agentMocks.gaps(input) },
    },
  },
});

export const PROJECT = "7d1f6c1e-0b0a-4c55-9d63-1d2f7d6a1b01";
export const PAGE_ID = "01900000-0000-7000-8000-000000000001";
const stamp = "2026-11-08T10:00:00.000Z";

export const page = (over: Record<string, unknown> = {}) => ({
  id: PAGE_ID,
  slug: "05-perimetre",
  title: "Périmètre",
  position: 4,
  required: true,
  origin: "template",
  status: "draft",
  version: 3,
  updatedAt: stamp,
  updatedBy: null,
  deletedAt: null,
  pendingProposals: 0,
  ...over,
});

export const proposal = (over: Record<string, unknown> = {}) => ({
  id: "01900000-0000-7000-8000-0000000000a1",
  messageId: "01900000-0000-7000-8000-0000000000b1",
  pageId: PAGE_ID,
  op: "insert_after",
  anchorBlockIndex: 0,
  rangeEnd: null,
  title: null,
  afterPageId: null,
  contentMd: "### Hors périmètre\n\n- Paiement en ligne",
  rationale: "suite à la réponse de Marie",
  baseVersion: 3,
  status: "pending",
  createdAt: stamp,
  ...over,
});

/** Flux simulé : les évènements arrivent un par un, `gate` retient le suivant (annulation). */
export async function* stream(events: unknown[], signal?: AbortSignal) {
  for (const event of events) {
    if (signal?.aborted) throw new DOMException("aborted", "AbortError");
    yield event;
  }
}

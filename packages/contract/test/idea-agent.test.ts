import { describe, expect, it } from "vitest";
import { generateOpenApi } from "../src/index.ts";
import { errors, input, isValid, output, proc, UUID, UUID2 } from "./support.ts";

/**
 * TK-90 lot A (contrat 2.5.0, additif) : propositions de l'agent (`idea.proposal.decide|undo`), fil
 * (`idea.message.list`), état (`idea.agent.status`), `ai.ideaChat` (flux) et `ai.ideaGaps`. Aucune sortie
 * ne porte d'identifiant d'utilisateur ni d'e-mail.
 */
const BASE = "/projects/{projectId}/idea";
const INSTANT = "2026-11-08T10:00:00.000Z";
const SUMMARY = {
  id: UUID,
  slug: "vision",
  title: "Vision",
  position: 0,
  required: true,
  origin: "template",
  status: "draft",
  version: 3,
  updatedAt: INSTANT,
  updatedBy: null,
  deletedAt: null,
};
const PROPOSAL = {
  id: UUID,
  messageId: UUID2,
  pageId: UUID2,
  op: "insert_after",
  anchorBlockIndex: 1,
  rangeEnd: null,
  title: null,
  afterPageId: null,
  contentMd: "Un paragraphe proposé.",
  rationale: "Le public n'est pas dit.",
  baseVersion: 3,
  status: "pending",
  createdAt: INSTANT,
};

type Doc = { paths: Record<string, Record<string, { responses: Record<string, unknown> }>> };
const doc = async () => (await generateOpenApi()) as unknown as Doc;

describe("idea agent : surface", () => {
  it.each([
    ["idea.proposal.decide", "post", `${BASE}/proposals/{proposalId}/decision`],
    ["idea.proposal.undo", "post", `${BASE}/proposals/{proposalId}/undo`],
    ["idea.message.list", "get", `${BASE}/messages`],
    ["idea.agent.status", "get", `${BASE}/agent`],
    ["ai.ideaChat", "post", "/projects/{projectId}/ai/idea/chat"],
    ["ai.ideaGaps", "post", "/projects/{projectId}/ai/idea/gaps"],
  ])("%s : %s %s dans l'OpenAPI", async (name, method, path) => {
    expect(proc(name)).toBeDefined();
    expect((await doc()).paths[path]?.[method], `${method} ${path}`).toBeDefined();
  });

  it("idea.proposal ne contient que decide et undo", () => {
    const group = (proc("idea") as unknown as Record<string, Record<string, unknown>>).proposal;
    expect(Object.keys(group ?? {}).sort()).toEqual(["decide", "undo"]);
  });

  it("ai.ideaChat répond en flux d'évènements (text/event-stream)", async () => {
    const operation = (await doc()).paths["/projects/{projectId}/ai/idea/chat"]?.post;
    expect(JSON.stringify(operation?.responses)).toContain("text/event-stream");
  });
});

describe("idea.proposal.decide et undo : entrées et erreurs", () => {
  const base = { projectId: UUID, proposalId: UUID2 };

  it("decide : accepter ou rejeter, avec un contenu modifié facultatif borné à 50 000", async () => {
    const decide = input("idea.proposal.decide");
    expect(await isValid(decide, { ...base, decision: "accept" })).toBe(true);
    expect(await isValid(decide, { ...base, decision: "reject" })).toBe(true);
    expect(await isValid(decide, { ...base, decision: "accept", contentMd: "Texte" })).toBe(true);
    expect(
      await isValid(decide, { ...base, decision: "accept", contentMd: "a".repeat(50_001) }),
    ).toBe(false);
    expect(await isValid(decide, { ...base, decision: "peut-être" })).toBe(false);
    expect(await isValid(decide, { projectId: UUID, decision: "accept" })).toBe(false);
  });

  it("undo : projet et proposition obligatoires", async () => {
    expect(await isValid(input("idea.proposal.undo"), base)).toBe(true);
    expect(await isValid(input("idea.proposal.undo"), { projectId: UUID })).toBe(false);
  });

  it("decide et undo : CONFLICT porte currentVersion, NOT_FOUND et FORBIDDEN existent", () => {
    for (const name of ["idea.proposal.decide", "idea.proposal.undo"]) {
      const map = errors(name);
      expect(map.CONFLICT?.status, name).toBe(409);
      expect(map.NOT_FOUND, name).toBeDefined();
      expect(map.FORBIDDEN, name).toBeDefined();
      expect(map.VALIDATION, name).toBeDefined();
    }
  });

  it("la sortie rend la proposition et la page touchée (ou rien pour un rejet)", async () => {
    const out = output("idea.proposal.decide");
    const page = { ...SUMMARY, contentMd: "x" };
    expect(await isValid(out, { proposal: { ...PROPOSAL, status: "accepted" }, page })).toBe(true);
    expect(await isValid(out, { proposal: { ...PROPOSAL, status: "rejected" }, page: null })).toBe(
      true,
    );
    expect(await isValid(out, { proposal: { ...PROPOSAL, status: "inconnu" }, page: null })).toBe(
      false,
    );
  });
});

describe("idea.message.list et idea.agent.status", () => {
  const message = {
    id: UUID,
    pageId: null,
    author: { name: "Awa Koné", isClient: false },
    mode: "interview",
    text: "Bonjour",
    createdAt: INSTANT,
  };

  it("message.list : liste à curseur, 50 par défaut, page de contexte facultative", async () => {
    const list = input("idea.message.list");
    expect(await isValid(list, { projectId: UUID })).toBe(true);
    expect(await isValid(list, { projectId: UUID, cursor: "abc", limit: "20" })).toBe(true);
    expect(await isValid(list, { projectId: UUID, limit: "101" })).toBe(false);
    expect(await isValid(list, {})).toBe(false);
  });

  it("message.list : un message de l'agent n'a pas d'auteur, jamais d'identifiant d'utilisateur", async () => {
    const out = output("idea.message.list");
    const page = (items: unknown[]) => ({
      items,
      nextCursor: null,
      previousCursor: null,
      offset: 0,
      total: items.length,
    });
    expect(await isValid(out, page([message, { ...message, author: null }]))).toBe(true);
    expect(await isValid(out, page([{ ...message, mode: "autre" }]))).toBe(false);
    expect(JSON.stringify(Object.keys(message))).not.toMatch(/userId|email/i);
  });

  it("agent.status : configuré ou non, et si l'appelant peut le configurer", async () => {
    expect(await isValid(input("idea.agent.status"), { projectId: UUID })).toBe(true);
    const out = output("idea.agent.status");
    expect(await isValid(out, { configured: false, canConfigure: true })).toBe(true);
    expect(await isValid(out, { configured: true })).toBe(false);
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("ai.ideaChat et ai.ideaGaps", () => {
  const chat = { projectId: UUID, mode: "interview", text: "Voici mon idée" };

  it("ideaChat : texte de 1 à 4 000 caractères, mode, action et sélection facultatives", async () => {
    const schema = input("ai.ideaChat");
    expect(await isValid(schema, chat)).toBe(true);
    expect(await isValid(schema, { ...chat, pageId: UUID2, mode: "free" })).toBe(true);
    expect(await isValid(schema, { ...chat, text: "a".repeat(4000) })).toBe(true);
    expect(await isValid(schema, { ...chat, text: "a".repeat(4001) })).toBe(false);
    expect(await isValid(schema, { ...chat, text: "" })).toBe(false);
    expect(await isValid(schema, { ...chat, mode: "autre" })).toBe(false);
    for (const action of ["develop", "challenge", "simplify", "find_gaps", "make_page"]) {
      expect(await isValid(schema, { ...chat, action, selection: "un passage" })).toBe(true);
    }
    expect(await isValid(schema, { ...chat, action: "supprimer" })).toBe(false);
    expect(await isValid(schema, { ...chat, selection: "a".repeat(4001) })).toBe(false);
  });

  it("ideaChat : les évènements sont text, proposals et done", async () => {
    const schema = output("ai.ideaChat");
    expect(schema).toBeDefined();
    const details = (await import("@orpc/contract")).getAsyncIteratorObjectSchemasDetails(
      proc("ai.ideaChat")?.["~orpc"].outputSchemas as never,
    );
    const yields = details?.yieldSchemas[0] as Parameters<typeof isValid>[0];
    expect(await isValid(yields, { type: "text", text: "Bonjour" })).toBe(true);
    expect(await isValid(yields, { type: "proposals", proposals: [PROPOSAL] })).toBe(true);
    expect(await isValid(yields, { type: "done", messageId: UUID })).toBe(true);
    expect(
      await isValid(yields, { type: "done", messageId: UUID, nextQuestion: "Pour qui ?" }),
    ).toBe(true);
    expect(await isValid(yields, { type: "autre" })).toBe(false);
  });

  it("ideaChat et ideaGaps : erreurs d'appel au modèle, sans clé ni prompt", () => {
    for (const name of ["ai.ideaChat", "ai.ideaGaps"]) {
      const map = errors(name);
      for (const code of [
        "LLM_NOT_CONFIGURED",
        "LLM_RATE_LIMITED",
        "LLM_PROVIDER_ERROR",
        "LLM_OUTPUT_INVALID",
        "LLM_CAP_REACHED",
        "PROMPT_REJECTED",
        "FORBIDDEN",
        "NOT_FOUND",
      ]) {
        expect(map[code], `${name} ${code}`).toBeDefined();
      }
    }
  });

  it("ideaGaps : au plus 4 manques, chacun lié à une page ou à un titre de page à créer", async () => {
    expect(await isValid(input("ai.ideaGaps"), { projectId: UUID })).toBe(true);
    const out = output("ai.ideaGaps");
    const item = { pageId: UUID, suggestedPageTitle: null, text: "Aucun chiffre de marché." };
    const result = (items: unknown[]) => ({ items, computedAt: INSTANT, cached: false });
    expect(await isValid(out, result([item]))).toBe(true);
    expect(
      await isValid(out, result([{ ...item, pageId: null, suggestedPageTitle: "Tarifs" }])),
    ).toBe(true);
    expect(await isValid(out, result([item, item, item, item, item]))).toBe(false);
  });
});

describe("idea.list et idea.get : extension additive", () => {
  it("list : pendingProposals par page et pendingPageProposals", async () => {
    const out = output("idea.list");
    const listing = {
      pages: [{ ...SUMMARY, pendingProposals: 2 }],
      trash: [],
      total: 1,
      publication: { available: false, last: null },
      pendingPageProposals: [{ ...PROPOSAL, op: "create_page", pageId: null, title: "Tarifs" }],
    };
    expect(await isValid(out, listing)).toBe(true);
    expect(await isValid(out, { ...listing, pendingPageProposals: undefined })).toBe(false);
    expect(await isValid(out, { ...listing, pages: [SUMMARY] })).toBe(false);
  });

  it("get : la page porte ses propositions en attente", async () => {
    const out = output("idea.get");
    const page = { ...SUMMARY, contentMd: "x", proposals: [PROPOSAL] };
    expect(await isValid(out, page)).toBe(true);
    expect(await isValid(out, { ...page, proposals: undefined })).toBe(false);
  });
});

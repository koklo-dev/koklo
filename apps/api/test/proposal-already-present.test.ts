import { GitRateLimitedError } from "@koklo/domain";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { insertProposal, proposalApi } from "./helpers/proposals.ts";
import { installBench } from "./helpers/repo-scene.ts";
import { deliverablesApi } from "./helpers/spec-deliverables.ts";
import { readScene, type SpecReadScene, seedIndex } from "./helpers/spec-read.ts";

/**
 * TK-114g lot A (A3, B699, B704) : `proposal.list` règle, avant de compter, les créations d'un lancement terminé déjà
 * présentes dans l'arbre au commit indexé (`rejected`, `already_present`). Aucune candidate : aucune lecture git ; lecture
 * impossible : rien n'est réglé, la liste répond comme avant. Le badge du menu (`pendingProposals`) les exclut.
 */
const read = installBench({ beforeAll, afterAll, beforeEach });
afterEach(() => vi.restoreAllMocks());

/** Section du scaffold (`architecture/overview/01-contexte.md`) : `DOC-contexte` est à la tête indexée. */
const PRESENT = { title: "Contexte", markdown: "Texte." };
const FRESH = { title: "Observabilité", markdown: "Texte." };

async function indexedScene() {
  const s = await readScene(read());
  await seedIndex(read(), s, [], { commit: true, entities: [] });
  return s;
}

/** Un lancement d'architecture `status` et ses sections proposées (`pending`), dans l'ordre. */
async function launchWith(s: SpecReadScene, sections: object[], status = "done") {
  const scope = { organizationId: s.organizationId, projectId: s.projectId };
  const first = await insertProposal(read().database, scope, {
    deliverable: "architecture",
    kind: "doc_section",
    zone: "Noyau",
    payload: sections[0] ?? PRESENT,
    title: "Section",
  });
  const ids = [first.id];
  for (const [position, payload] of sections.slice(1).entries()) {
    const next = await insertProposal(read().database, scope, {
      launchId: first.launchId,
      deliverable: "architecture",
      kind: "doc_section",
      zone: "Noyau",
      position: position + 1,
      payload,
      title: "Section",
    });
    ids.push(next.id);
  }
  await read().database.query("UPDATE agent_launches SET status = $2 WHERE id = $1", [
    first.launchId,
    status,
  ]);
  return ids;
}

const list = (s: SpecReadScene) =>
  proposalApi(read().app, s.world.actors.dev).list(s.projectId, {
    deliverable: "architecture",
  });

const rowsOf = (ids: string[]) =>
  read().database.query<{ id: string; status: string; discard_reason: string | null }>(
    "SELECT id, status, discard_reason FROM agent_proposals WHERE id = ANY($1::uuid[]) ORDER BY position",
    [ids],
  );

const gitReads = () =>
  read().harness.calls.filter((c) => /^(readFile|listFiles)$/.test(c.method)).length;

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("proposal.list règle les déjà présentes (TK-114g, A3)", () => {
  it("lancement terminé : la section déjà à la tête devient rejetée already_present, comptée à part", async () => {
    const s = await indexedScene();
    const [present = "", fresh = ""] = await launchWith(s, [PRESENT, FRESH]);
    const res = await list(s);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const byId = new Map(res.body.items.map((item: { id: string }) => [item.id, item]));
    expect(byId.get(present)).toMatchObject({
      status: "rejected",
      discardReason: "already_present",
    });
    expect(byId.get(fresh)).toMatchObject({ status: "pending" });
    expect(byId.get(fresh)).not.toHaveProperty("discardReason");
    expect(res.body.groups).toEqual([
      expect.objectContaining({ total: 2, pending: 1, rejected: 0, alreadyPresent: 1 }),
    ]);
    const entries = (await deliverablesApi(read().app, s.world.actors.dev).list(s.projectId)).body
      .deliverables as { key: string; pendingProposals: number }[];
    expect(entries.find((e) => e.key === "architecture")?.pendingProposals).toBe(1);
  });

  it("2ᵉ appel : rien à régler, aucune lecture git nouvelle", async () => {
    const s = await indexedScene();
    await launchWith(s, [PRESENT]);
    expect((await list(s)).status).toBe(200);
    read().harness.calls = [];
    const again = await list(s);
    expect(again.status).toBe(200);
    expect(again.body.groups[0]).toMatchObject({ pending: 0, alreadyPresent: 1 });
    expect(gitReads()).toBe(0);
  });

  it("lancement en cours : rien réglé, aucune lecture git", async () => {
    const s = await indexedScene();
    const ids = await launchWith(s, [PRESENT], "running");
    read().harness.calls = [];
    expect((await list(s)).status).toBe(200);
    expect(await rowsOf(ids)).toEqual([
      expect.objectContaining({ status: "pending", discard_reason: null }),
    ]);
    expect(gitReads()).toBe(0);
  });

  it.each([
    [
      "quota épuisé",
      () => new GitRateLimitedError({ operation: "listFiles", retryAfterMs: 1_800_000 }),
    ],
    ["erreur du fournisseur", () => new Error("panne")],
  ])("%s : liste 200 comme avant, rien réglé", async (_label, failure) => {
    const s = await indexedScene();
    const ids = await launchWith(s, [PRESENT]);
    vi.spyOn(read().harness.inner, "listFiles").mockRejectedValue(failure());
    const res = await list(s);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.groups[0]).toMatchObject({ pending: 1 });
    expect(res.body.groups[0]).not.toHaveProperty("alreadyPresent");
    expect(await rowsOf(ids)).toEqual([
      expect.objectContaining({ status: "pending", discard_reason: null }),
    ]);
  });

  it("composant mis à jour (specId posé) : jamais réglé ; aucune candidate → aucune lecture git", async () => {
    const s = await indexedScene();
    const scope = { organizationId: s.organizationId, projectId: s.projectId };
    const { id, launchId } = await insertProposal(read().database, scope, {
      deliverable: "architecture",
      kind: "component",
      zone: "Noyau",
      payload: { name: "Contexte", specId: "C-contexte" },
      title: "Contexte",
    });
    read().harness.calls = [];
    expect((await list(s)).status).toBe(200);
    expect(await rowsOf([id])).toEqual([expect.objectContaining({ status: "pending" })]);
    expect(gitReads()).toBe(0);
    expect(launchId).toBeDefined();
  });

  it("une proposition d'un autre projet n'est jamais touchée", async () => {
    const s = await indexedScene();
    const other = await indexedScene();
    const [mine = ""] = await launchWith(s, [PRESENT]);
    const [theirs = ""] = await launchWith(other, [PRESENT]);
    expect((await list(s)).status).toBe(200);
    const rows = new Map((await rowsOf([mine, theirs])).map((row) => [row.id, row]));
    expect(rows.get(mine)).toMatchObject({ status: "rejected", discard_reason: "already_present" });
    expect(rows.get(theirs)).toMatchObject({ status: "pending", discard_reason: null });
  });
});

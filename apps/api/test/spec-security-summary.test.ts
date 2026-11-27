import { FakeLlm } from "@koklo/domain/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { installAiBench, setKey } from "./helpers/ai-bench.ts";
import { insertProposal, launchRows } from "./helpers/proposals.ts";
import { batchRows, operationRows } from "./helpers/spec-batch.ts";
import { deliverablesApi } from "./helpers/spec-deliverables.ts";
import {
  clientSecurityApi,
  entryEntity,
  SUMMARY,
  securityApi,
  securityScene,
  summaryEntity,
} from "./helpers/spec-security.ts";
import { linkClient } from "./helpers/tickets.ts";

/**
 * TK-117 lot B (B796, B800, B801, B806, B807) : résumé client côté équipe. Sept cartes aux titres fixes, conservation
 * composée des durées saisies, contact lu par l'équipe, « Accepter » une proposition par un lot d'une opération,
 * « Mettre à jour avec l'agent » par le circuit commun.
 */
const bench = installAiBench({ beforeAll, afterAll, beforeEach });

const proposalContent = {
  location: "Chez l'hébergeur, à Lyon.",
  protection: "Les téléphones sont chiffrés.",
  access: "Chacun voit les siens.",
  signIn: "Un lien à usage unique.",
  checks: "Des tests à chaque modification.",
  incident: "Nous vous prévenons sous 24 heures.",
};

async function summaryScene() {
  const b = bench();
  const s = await securityScene(b, [
    entryEntity("t.telephone", {
      donnee: "Téléphone",
      categorie: "contact",
      conservation: "3 ans",
    }),
    entryEntity("t.note", {
      donnee: "Note",
      categorie: "sensible",
      conservation_proposee: "1 an",
    }),
    summaryEntity({ conservation: "Texte figé" }),
  ]);
  return { b, s, api: securityApi(b.app, s.world.actors.dev) };
}
const pending = (
  s: Awaited<ReturnType<typeof summaryScene>>["s"],
  over: { kind?: string; payload?: object } = {},
) =>
  insertProposal(
    bench().database,
    { organizationId: s.organizationId, projectId: s.projectId },
    { deliverable: "security", kind: "summary", payload: proposalContent, ...over },
  );

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("security.summary", () => {
  it("sept cartes, la conservation recomposée sans la suggestion de l'agent", async () => {
    const { s, api } = await summaryScene();
    const res = await api.summary(s.projectId);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.available).toBe(true);
    expect(res.body.cards.map((c: { key: string }) => c.key)).toEqual([
      "location",
      "protection",
      "access",
      "signIn",
      "retention",
      "checks",
      "incident",
    ]);
    expect(res.body.cards[0]).toEqual({
      key: "location",
      title: "Où sont les données",
      text: SUMMARY.donnees,
    });
    expect(res.body.cards[4].text).toBe("Téléphone : 3 ans. Note : à décider.");
    expect(res.body.contact).toBeUndefined();
  });

  it("le contact saisi par le client est lu par l'équipe", async () => {
    const { b, s, api } = await summaryScene();
    const client = s.world.actors.client;
    await linkClient(b.database, s.organizationId, s.projectId, client.userId);
    const set = await clientSecurityApi(b.app, client).setContact(
      s.projectId,
      "Marie Exemple",
      "06 00 00 00 00",
    );
    expect(set.status, JSON.stringify(set.body)).toBe(200);
    expect((await api.summary(s.projectId)).body.contact).toEqual({
      name: "Marie Exemple",
      phone: "06 00 00 00 00",
    });
  });

  it("« Accepter » : la proposition est acceptée et part dans un lot d'une opération", async () => {
    const { b, s, api } = await summaryScene();
    const proposal = await pending(s);
    const res = await api.accept(s.projectId, proposal.id);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.results).toEqual([{ position: 0, kind: "summary.update", specId: null }]);
    const [batch] = await batchRows(b.database, s.projectId);
    expect(await operationRows(b.database, batch?.id ?? "")).toMatchObject([
      { kind: "summary.update", payload: proposalContent },
    ]);
    const [row] = await b.database.query<{ status: string; applied_batch_id: string }>(
      "SELECT status, applied_batch_id FROM agent_proposals WHERE id = $1",
      [proposal.id],
    );
    expect(row).toEqual({ status: "accepted", applied_batch_id: batch?.id });
  });

  it("proposition d'un autre type ou inconnue : 422 ou 404, aucun lot", async () => {
    const { b, s, api } = await summaryScene();
    const other = await pending(s, { kind: "right", payload: { ownershipRule: "x" } });
    expect((await api.accept(s.projectId, other.id)).status).toBe(422);
    expect((await api.accept(s.projectId, "123e4567-e89b-42d3-a456-426614174000")).status).toBe(
      404,
    );
    expect(await batchRows(b.database, s.projectId)).toHaveLength(0);
  });

  it("proposition au résumé portant un identifiant : refusée, aucun lot", async () => {
    const { b, s, api } = await summaryScene();
    const leaking = await pending(s, {
      payload: { ...proposalContent, access: "Voir SEC-T01." },
    });
    expect((await api.accept(s.projectId, leaking.id)).status).toBe(422);
    expect(await batchRows(b.database, s.projectId)).toHaveLength(0);
  });

  it("« Mettre à jour avec l'agent » : le lancement `summary` du circuit commun", async () => {
    const { b, s, api } = await summaryScene();
    await setKey(b.app, s.world, "FAKE-KEY-NOT-REAL-0117");
    b.use(FakeLlm.replying({}));
    expect((await api.propose(s.projectId)).status).toBe(422);
    await deliverablesApi(b.app, s.world.actors.owner).force(s.projectId, "security");
    const res = await api.propose(s.projectId);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const rows = await launchRows(b.database, s.projectId);
    expect(rows.map((r) => [r.deliverable, r.mode])).toEqual([["security", "summary"]]);
    expect((await api.propose(s.projectId)).status).toBe(409);
  });
});

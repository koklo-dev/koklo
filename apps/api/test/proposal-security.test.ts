import { FakeLlm } from "@koklo/domain/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { installAiBench, setKey } from "./helpers/ai-bench.ts";
import { insertProposal, launchRows, proposalApi } from "./helpers/proposals.ts";
import { deliverablesApi } from "./helpers/spec-deliverables.ts";
import {
  asvsEntity,
  entryEntity,
  operationOf,
  securityScene,
  tableEntity,
  threatEntity,
} from "./helpers/spec-security.ts";

/**
 * TK-117 lot B (cas 6, B806) : l'agent de la Sécurité, par le circuit commun. Options sans compte nul, première
 * recommandée, livrable ouvert, modes fermés, un seul lancement actif, relecture groupée Menaces, Données sensibles,
 * Droits, Exigences, Document.
 */
const bench = installAiBench({ beforeAll, afterAll, beforeEach });

/** F-001 exposée sans menace, F-002 avec une menace sans parade ; deux champs non classés, une exigence sans réponse. */
const BUSY = () => [
  operationOf("client.list", "PM-client.lire", ["F-001", "F-002"]),
  threatEntity("SEC-T01", { surfaces: ["F-002"], parades: [] }),
  tableEntity("clientes", ["telephone", "note"]),
  asvsEntity({
    exigences: [{ id: "EX-001", chapitre: "api", titre: "Contrat", niveau: 1 }],
  }),
];
/** Tout traité : surfaces couvertes, champs classés, aucune exigence sans réponse. */
const DONE = () => [
  threatEntity("SEC-T01", { surfaces: ["api"] }),
  threatEntity("SEC-T02", { surfaces: ["F-001"] }),
  threatEntity("SEC-T03", { surfaces: ["F-002"] }),
  tableEntity("clientes", ["identifiant"]),
  entryEntity("clientes.identifiant"),
  asvsEntity({
    exigences: [{ id: "EX-001", chapitre: "api", titre: "Contrat", niveau: 1, reponse: "Oui" }],
  }),
];

async function scene(entities = BUSY(), open = true) {
  const b = bench();
  const s = await securityScene(b, entities);
  await setKey(b.app, s.world, "FAKE-KEY-NOT-REAL-0117");
  b.use(FakeLlm.replying({}));
  if (open) {
    const forced = await deliverablesApi(b.app, s.world.actors.owner).force(
      s.projectId,
      "security",
    );
    expect(forced.status, JSON.stringify(forced.body)).toBe(200);
  }
  const api = proposalApi(b.app, s.world.actors.dev);
  const propose = (mode: string) => api.propose(s.projectId, { deliverable: "security", mode });
  return { b, s, api, propose };
}

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("agent de la Sécurité", () => {
  it("options : comptes calculés, première recommandée, sources lues", async () => {
    const { s, api } = await scene();
    const res = await api.options(s.projectId, "security");
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.options).toEqual([
      { id: "threats", count: 3, recommended: true },
      { id: "classify", count: 2, recommended: false },
      { id: "asvs", count: 1, recommended: false },
      { id: "summary", recommended: false },
    ]);
    expect(res.body.reads.map((r: { id: string }) => r.id)).toEqual([
      "functional.features",
      "data.tables",
      "technical.current",
    ]);
    expect(res.body.available).toBe(true);
  });

  it("rien à traiter : les options à compte nul sont masquées, asvs et résumé gardés", async () => {
    const { s, api, propose } = await scene(DONE());
    const res = await api.options(s.projectId, "security");
    expect(res.body.options).toEqual([
      { id: "asvs", recommended: true },
      { id: "summary", recommended: false },
    ]);
    expect((await propose("threats")).status).toBe(422);
    expect((await propose("classify")).status).toBe(422);
  });

  it.each(["threats", "classify", "asvs", "summary"])("mode %s : accepté", async (mode) => {
    const { b, s, propose } = await scene();
    const res = await propose(mode);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const [launch] = await launchRows(b.database, s.projectId);
    expect(launch).toMatchObject({ deliverable: "security", mode });
    expect(launch?.sources).toContain("security.current");
    expect((await propose(mode)).status).toBe(409);
  });

  it("mode d'un autre livrable, ou livrable fermé : 422, aucun lancement", async () => {
    const open = await scene();
    expect((await open.propose("complete")).status).toBe(422);
    expect(await launchRows(open.b.database, open.s.projectId)).toHaveLength(0);
    const closed = await scene(BUSY(), false);
    const res = await closed.propose("summary");
    expect(res.status).toBe(422);
    expect(res.body.data.field).toBe("deliverable");
  });

  it("retoucher garde la cible posée par le code, jamais celle du modèle (exigence reprise)", async () => {
    const { b, s, api } = await scene();
    const requirement = { chapter: "api", title: "Contrat", level: 1, answer: "Oui.", links: [] };
    const proposal = await insertProposal(
      b.database,
      { organizationId: s.organizationId, projectId: s.projectId },
      {
        deliverable: "security",
        kind: "asvs",
        payload: { requirement: { ...requirement, specId: "EX-001" } },
      },
    );
    b.use(FakeLlm.replying({ requirement: { ...requirement, specId: "EX-999" } }));
    const res = await api.revise(s.projectId, proposal.id);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.content.requirement.specId).toBe("EX-001");
  });

  it("designer : ni décider, ni décider en groupe, ni retoucher une proposition de la Sécurité", async () => {
    const { b, s } = await scene();
    const proposal = await insertProposal(
      b.database,
      { organizationId: s.organizationId, projectId: s.projectId },
      { deliverable: "security", kind: "right", payload: { ownershipRule: "Chacun les siens." } },
    );
    const designer = proposalApi(b.app, s.world.actors.designer);
    for (const res of [
      await designer.decide(s.projectId, proposal.id, "accept"),
      await designer.decideMany(s.projectId, {
        launchId: proposal.launchId,
        group: "all",
        expectedPending: 1,
      }),
      await designer.revise(s.projectId, proposal.id),
    ]) {
      expect(res.status, JSON.stringify(res.body)).toBe(403);
    }
  });

  it("relecture groupée par type : menaces, données, droits, exigences puis document", async () => {
    const { b, s, api } = await scene();
    const scope = { organizationId: s.organizationId, projectId: s.projectId };
    const kinds = [
      ["doc_section", { title: "Objet", markdown: "x" }],
      ["asvs", { facts: [{ label: "a", value: "b" }] }],
      ["right", { ownershipRule: "Chacun voit les siens." }],
      ["sensitive", { data: "Note", fields: ["clientes.note"], category: "contact", access: [] }],
      ["threat", { title: "Abus" }],
    ] as const;
    let launchId: string | undefined;
    let position = 0;
    for (const [kind, payload] of kinds) {
      for (let i = 0; i < 7; i += 1) {
        const row = await insertProposal(b.database, scope, {
          deliverable: "security",
          kind,
          payload,
          position: position++,
          ...(launchId === undefined ? {} : { launchId }),
        });
        launchId = row.launchId;
      }
    }
    const res = await api.list(s.projectId, { deliverable: "security", groupBy: "type" });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.groups.map((g: { label: string }) => g.label)).toEqual([
      "Menaces",
      "Données sensibles",
      "Droits",
      "Exigences",
      "Document · dossier de sécurité",
    ]);
  });
});

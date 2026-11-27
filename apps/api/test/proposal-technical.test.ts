import { FakeLlm } from "@koklo/domain/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { installAiBench, setKey } from "./helpers/ai-bench.ts";
import { insertProposal, launchRows, proposalApi } from "./helpers/proposals.ts";
import { readScene, seedIndex } from "./helpers/spec-read.ts";
import { componentEntity, nfrEntity, stackEntity } from "./helpers/spec-technical.ts";
import { send } from "./helpers/tickets.ts";

/**
 * TK-115 lot B (cas 8, cas 6, B725, B727) : l'agent du cahier technique. Quatre modes, livrable ouvert et au moins un
 * composant, owner, admin et développeur seuls (designer 403, même pour relire), un seul lancement actif ; options sans
 * compte inventé ; propositions groupées par type, document en tête ; préremplissage des feuilles.
 */
const bench = installAiBench({ beforeAll, afterAll, beforeEach });

const READS = [
  "functional.features",
  "functional.rules",
  "functional.roles",
  "functional.flows",
  "data.tables",
  "architecture.current",
  "nfr.known",
  "technical.current",
];

/** Projet avec clé et architecture indexée ; `open` : le livrable Technique est ouvert par un forçage. */
async function techScene({ open = true, entities = [componentEntity("C-sms")] } = {}) {
  const b = bench();
  const scene = await readScene(b);
  await setKey(b.app, scene.world, "FAKE-KEY-NOT-REAL-0115");
  b.use(FakeLlm.replying({}));
  await seedIndex(b, scene, [{ id: "F-001", titre: "Réserver" }], { commit: true, entities });
  if (open) {
    const forced = await send(
      b.app,
      scene.world.actors.owner.cookie,
      "post",
      `/projects/${scene.projectId}/spec/deliverables/technical/force`,
      { projectId: scene.projectId, key: "technical", confirm: true },
    );
    expect(forced.status, JSON.stringify(forced.body)).toBe(200);
  }
  return { b, scene, world: scene.world };
}
const propose = (s: Awaited<ReturnType<typeof techScene>>, mode: string, role = "dev" as const) =>
  proposalApi(s.b.app, s.world.actors[role]).propose(s.world.projectId, {
    deliverable: "technical",
    mode,
  });
const openChoice = () => [componentEntity("C-sms"), stackEntity("ST-sms"), nfrEntity("NFR-001")];

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("ai.proposeDeliverable technical", () => {
  it.each(["complete", "compare", "nfr", "all"])("mode %s : accepté", async (mode) => {
    const s = await techScene({ entities: openChoice() });
    const res = await propose(s, mode);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const rows = await launchRows(s.b.database, s.world.projectId);
    expect(rows.map((r) => [r.deliverable, r.mode, r.base_version])).toEqual([
      ["technical", mode, null],
    ]);
    expect(rows[0]?.sources).toEqual(READS);
  });

  it.each(["criteria", "decision", "document"])("mode %s : 422, aucun lancement", async (mode) => {
    const s = await techScene({ entities: openChoice() });
    expect((await propose(s, mode)).status).toBe(422);
    expect(await launchRows(s.b.database, s.world.projectId)).toHaveLength(0);
  });

  it.each(["compare", "nfr"])("mode %s sans rien à traiter : 422", async (mode) => {
    const s = await techScene();
    expect((await propose(s, mode)).status).toBe(422);
  });

  it("architecture non validée sans forçage, ou aucun composant : 422, aucun lancement", async () => {
    const closed = await techScene({ open: false });
    const first = await propose(closed, "complete");
    expect(first.status, JSON.stringify(first.body)).toBe(422);
    const bare = await techScene({ entities: [] });
    const second = await propose(bare, "complete");
    expect(second.status).toBe(422);
    expect(second.body.data.field).toBe("deliverable");
    expect(await launchRows(bare.b.database, bare.world.projectId)).toHaveLength(0);
  });

  it("un lancement en cours : 409 PROPOSAL_IN_PROGRESS", async () => {
    const s = await techScene();
    const first = await propose(s, "complete");
    const second = await propose(s, "all");
    expect(second.status).toBe(409);
    expect(second.body.data.launchId).toBe(first.body.launchId);
  });

  it.each(["designer", "client", "business"] as const)(
    "%s : 403 sur propose, options et relecture, aucun lancement",
    async (role) => {
      const s = await techScene({ entities: openChoice() });
      const proposal = await insertProposal(s.b.database, s.scene, {
        kind: "nfr",
        deliverable: "technical",
      });
      const api = proposalApi(s.b.app, s.world.actors[role]);
      const p = s.world.projectId;
      const answers = [
        await api.propose(p, { deliverable: "technical" }),
        await api.options(p, "technical"),
        await api.list(p, { deliverable: "technical", groupBy: "type" }),
        await api.decide(p, proposal.id, "accept"),
        await api.decideMany(p, { launchId: proposal.launchId, group: "all", expectedPending: 1 }),
        await api.revise(p, proposal.id),
        await send(s.b.app, s.world.actors[role].cookie, "post", `/projects/${p}/ai/item/prefill`, {
          projectId: p,
          type: "stack",
          description: "Un outil",
        }),
      ];
      expect(answers.map((res) => res.status)).toEqual(answers.map(() => 403));
      expect(await launchRows(s.b.database, p)).toHaveLength(1);
    },
  );

  it("le designer relit toujours le Fonctionnel", async () => {
    const s = await techScene();
    const res = await proposalApi(s.b.app, s.world.actors.designer).list(s.world.projectId);
    expect(res.status).toBe(200);
  });
});

describe("ai.proposeOptions technical", () => {
  const options = async (entities: ReturnType<typeof openChoice>, open = true) => {
    const s = await techScene({ entities, open });
    return proposalApi(s.b.app, s.world.actors.dev).options(s.world.projectId, "technical");
  };

  it("choix à trancher et exigences : quatre options, un seul compte ; ce que l'agent lit", async () => {
    const res = await options(openChoice());
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toEqual({
      available: true,
      options: [
        { id: "complete", recommended: true },
        { id: "compare", count: 1, recommended: false },
        { id: "nfr", recommended: false },
        { id: "all", recommended: false },
      ],
      reads: [
        { id: "architecture.current", label: "Architecture" },
        { id: "nfr.known", label: "Exigences" },
      ],
    });
  });

  it("rien à trancher ni exigence : compléter et tout reproposer seulement", async () => {
    const res = await options([componentEntity("C-sms")]);
    expect(res.body.options.map((o: { id: string }) => o.id)).toEqual(["complete", "all"]);
  });
});

describe("proposal.list technical", () => {
  it("groupes par type : document, stack, opérations, exigences, environnements", async () => {
    const s = await techScene();
    const kinds = ["env", "nfr", "op", "stack", "doc_section"];
    let launchId: string | undefined;
    for (let i = 0; i < 35; i += 1) {
      const created = await insertProposal(s.b.database, s.scene, {
        kind: kinds[i % 5],
        deliverable: "technical",
        position: i,
        ...(launchId === undefined ? {} : { launchId }),
      });
      launchId = created.launchId;
    }
    const res = await proposalApi(s.b.app, s.world.actors.dev).list(s.world.projectId, {
      deliverable: "technical",
      groupBy: "type_zone",
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.groups.map((g: { key: string; label: string }) => [g.key, g.label])).toEqual([
      ["doc_section", "Document · cahier technique"],
      ["stack", "Stack"],
      ["op", "Opérations de l'API"],
      ["nfr", "Exigences"],
      ["env", "Environnements"],
    ]);
  });
});

describe("ai.prefillItem technique", () => {
  it("feuille « Choix technique » : les champs du modèle, sans identifiant ni valeur inventée par le serveur", async () => {
    const s = await techScene();
    const values = {
      role: "Génération de PDF",
      status: "chosen",
      choice: "Typst",
      options: ["Typst", "Puppeteer"],
      criteria: ["Rapidité"],
      why: "Rendu rapide.",
    };
    s.b.use(FakeLlm.replying(values));
    const res = await send(
      s.b.app,
      s.world.actors.dev.cookie,
      "post",
      `/projects/${s.world.projectId}/ai/item/prefill`,
      { projectId: s.world.projectId, type: "stack", description: "Un générateur de PDF" },
    );
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toEqual({ type: "stack", values });
    expect(await launchRows(s.b.database, s.world.projectId)).toHaveLength(0);
  });
});

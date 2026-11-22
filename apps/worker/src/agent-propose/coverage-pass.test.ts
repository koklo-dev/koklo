import { describe, expect, it } from "vitest";
import { benchOf, type Reply, ScriptedAi } from "../../test/support/propose-run.ts";
import type { PublishedProposal } from "./coverage.ts";
import { coverageIndexOf } from "./coverage.ts";
import { coveragePass } from "./coverage-pass.ts";
import type { LaunchSources } from "./sources.ts";

/**
 * TK-114b (B616, B621) : passe de couverture. Le modèle ne peut viser qu'une fonctionnalité du paquet et un composant connu
 * (index, lancement, même réponse), une fois par fonctionnalité ; arrêt à zéro trou, au plafond de 30 appels, ou après une
 * passe complète sans trou comblé.
 */
const SOURCES: LaunchSources = {
  tag: "architecture",
  pages: [],
  synthesis: null,
  risks: null,
  features: ["F-001", "F-002", "F-003"].map((specId) => ({
    specId,
    title: `Fonctionnalité ${specId}`,
    criteria: [],
  })),
  rules: [],
  // TK-114d : aucun rôle ici (la passe des applications est couverte par entry-apps.test.ts).
  roles: [],
  flows: [],
  tables: [],
  tableIds: [],
  architecture: {
    components: [
      {
        specId: "C-paiement",
        title: "Paiement",
        zone: "Achats",
        type: "service",
        owns: [],
        serves: [],
        dependsOn: [{ to: "C-banque", via: "HTTPS" }],
      },
      { specId: "C-banque", title: "Banque", zone: "Achats", type: "ext", owns: [], serves: [] },
    ],
    archflows: [],
    decisions: [],
    nfr: [],
  },
};

const panier = (over: Record<string, unknown> = {}) => ({
  kind: "component",
  rationale: "Absent de l'architecture",
  content: {
    name: "Panier",
    type: "service",
    zone: "Achats",
    responsibility: "Garde le panier.",
    dependsOn: [{ to: "C-paiement", via: "HTTP" }],
    ...over,
  },
});

const EMPTY: Reply = { output: { assignments: [], proposals: [] } };

/** Réponses dans l'ordre, puis des réponses vides. */
const replies =
  (...list: Reply[]) =>
  (n: number): Reply =>
    list[n - 1] ?? EMPTY;

function passOf(ai: ScriptedAi, options: Parameters<typeof benchOf>[2] = {}) {
  const bench = benchOf(SOURCES, ai, options);
  return { ...bench, pass: coveragePass(bench.run, coverageIndexOf(SOURCES)) };
}

const servesOf = (payload: Record<string, unknown>) => payload.serves ?? [];

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("coveragePass (TK-114b, B616)", () => {
  it("affectations hostiles : feature hors paquet, composant inconnu (sans consommer la feature), doublon, forme invalide", async () => {
    const hostile: Reply = {
      output: {
        assignments: [
          { feature: "F-999", component: "C-paiement" },
          { feature: "F-001", component: "C-inconnu" },
          { feature: "F-002", component: "C-paiement" },
          { feature: "F-002", component: "C-panier" },
          { feature: 42, component: "C-paiement" },
          "F-003",
          { feature: "F-003", component: "C-fantome" },
          { feature: "F-003", component: "C-paiement" },
        ],
        proposals: [panier()],
      },
    };
    const { store, ai, pass } = passOf(new ScriptedAi(replies(hostile)));
    expect(await pass).toBe("cap");
    expect(ai.requests).toHaveLength(2);
    const text = JSON.stringify(store.proposals);
    expect(text).not.toContain("F-999");
    expect(text).not.toContain("C-inconnu");
    expect(text).not.toContain("F-001");
    expect(text).not.toContain("C-fantome");
    const byId = Object.fromEntries(
      store.proposals.map((p) => [p.payload.specId ?? p.title, servesOf(p.payload)]),
    );
    expect(byId).toEqual({ Panier: [], "C-paiement": ["F-002", "F-003"] });
    expect(store.state.coverageAfter?.features).toEqual({ covered: 2, total: 3 });
  });

  it("cibles connues : composant de la même réponse, proposition en attente (complément), composant indexé (specId)", async () => {
    const ai = new ScriptedAi(
      replies(
        {
          output: {
            assignments: [{ feature: "F-001", component: "C-panier" }],
            proposals: [panier()],
          },
        },
        { output: { assignments: [{ feature: "F-002", component: "C-panier" }], proposals: [] } },
        { output: { assignments: [{ feature: "F-003", component: "C-paiement" }], proposals: [] } },
      ),
    );
    const { store, pass } = passOf(ai);
    expect(await pass).toBe("completed");
    expect(ai.requests).toHaveLength(3);
    expect(store.proposals.map((p) => [p.title, servesOf(p.payload)])).toEqual([
      ["Panier", ["F-001", "F-002"]],
      ["Paiement", ["F-003"]],
    ]);
    expect(store.state).toMatchObject({ coverageCalls: 3, coverageStalled: 0 });
  });

  it("une cible décidée entre-temps (proposition specId acceptée) est ignorée (B621)", async () => {
    const ai = new ScriptedAi(
      replies({
        output: { assignments: [{ feature: "F-001", component: "C-paiement" }], proposals: [] },
      }),
    );
    const bench = benchOf(SOURCES, ai);
    bench.store.proposals.push({
      id: "p-decidee",
      kind: "component",
      zone: "Achats",
      title: "Paiement",
      status: "accepted",
      applied: true,
      payload: { specId: "C-paiement", name: "Paiement", serves: [] },
      position: 0,
    });
    expect(await coveragePass(bench.run, coverageIndexOf(SOURCES))).toBe("cap");
    expect(bench.store.proposals).toHaveLength(1);
    expect(bench.store.proposals[0]?.payload.serves).toEqual([]);
  });

  it("les tables d'un composant proposé par la couverture sont retirées : le code seul les rattache (B614)", async () => {
    const ai = new ScriptedAi(
      replies({ output: { proposals: [panier({ owns: ["T-commande"] })] } }),
    );
    const { store, pass } = passOf(ai);
    await pass;
    expect(store.proposals[0]?.payload).not.toHaveProperty("owns");
  });

  it("plafond de 30 appels : au 30e appel la passe s'arrête (cap), même avec des trous", async () => {
    const progress = {
      output: { assignments: [{ feature: "F-001", component: "C-paiement" }], proposals: [] },
    };
    const last = passOf(new ScriptedAi(replies(progress)), { progress: { coverageCalls: 29 } });
    expect(await last.pass).toBe("cap");
    expect(last.ai.requests).toHaveLength(1);
    const full = passOf(new ScriptedAi(replies(progress)), { progress: { coverageCalls: 30 } });
    expect(await full.pass).toBe("cap");
    expect(full.ai.requests).toHaveLength(0);
  });

  it("stalled : repris du segment précédent ; une passe complète sans trou comblé donne cap", async () => {
    const resumed = passOf(new ScriptedAi(replies()), { progress: { coverageStalled: 1 } });
    expect(await resumed.pass).toBe("cap");
    expect(resumed.ai.requests).toHaveLength(0);
    const fresh = passOf(new ScriptedAi(replies()));
    expect(await fresh.pass).toBe("cap");
    expect(fresh.ai.requests).toHaveLength(1);
    expect(fresh.store.state.coverageStalled).toBe(1);
  });

  it("sortie coupée : l'appel compte, motif écarté, rien publié", async () => {
    const ai = new ScriptedAi(replies({ output: { proposals: [panier()] }, stop: "max-tokens" }));
    const { store, pass } = passOf(ai);
    expect(await pass).toBe("cap");
    expect(store.proposals).toHaveLength(0);
    expect(store.state).toMatchObject({ coverageCalls: 1, discardedCount: 1 });
  });

  it("zéro trou : completed sans appel ; temps épuisé : handoff, ou deadline au huitième segment", async () => {
    const served = {
      ...SOURCES,
      architecture: {
        ...(SOURCES.architecture as NonNullable<LaunchSources["architecture"]>),
        components: [
          {
            specId: "C-paiement",
            title: "Paiement",
            zone: "Achats",
            type: "service",
            owns: [],
            serves: ["F-001", "F-002", "F-003"],
            dependsOn: [{ to: "C-banque", via: "HTTPS" }],
          },
          {
            specId: "C-banque",
            title: "Banque",
            zone: "Achats",
            type: "ext",
            owns: [],
            serves: [],
          },
        ],
      },
    };
    const none = benchOf(served, new ScriptedAi(replies()));
    expect(await coveragePass(none.run, coverageIndexOf(served))).toBe("completed");
    expect(none.ai.requests).toHaveLength(0);
    const late = new ScriptedAi(replies());
    late.clock = 10;
    expect(await passOf(late, { deadlineMs: 1 }).pass).toBe("handoff");
    expect(await passOf(late, { deadlineMs: 1, progress: { segment: 7 } }).pass).toBe("deadline");
    expect(late.requests).toHaveLength(0);
  });

  it("lancement arrêté de l'extérieur : stopped, rien publié", async () => {
    const ai = new ScriptedAi(replies({ output: { proposals: [panier()] } }));
    const bench = benchOf(SOURCES, ai);
    bench.store.state.status = "cancelled";
    expect(await coveragePass(bench.run, coverageIndexOf(SOURCES))).toBe("stopped");
    expect(bench.store.proposals).toHaveLength(0);
  });
});

/**
 * TK-114c (B633 à B636) : faux moteur « Toto », 23 composants indexés en 8 zones, 3 seulement reliés (t01 → t02 → t03). La
 * même passe propose les liens des composants isolés, 10 par paquet, et les écrit là où ils peuvent l'être.
 */
const tid = (n: number) => `C-t${String(n).padStart(2, "0")}`;
const TOTO: LaunchSources = {
  ...SOURCES,
  features: [],
  roles: [],
  architecture: {
    components: Array.from({ length: 23 }, (_, i) => ({
      specId: tid(i + 1),
      title: `Toto ${i + 1}`,
      zone: `Zone ${(i % 8) + 1}`,
      type: "service",
      owns: [],
      serves: [],
      dependsOn: i < 2 ? [{ to: tid(i + 2), via: "HTTP" }] : [],
    })),
    archflows: [],
    decisions: [],
    nfr: [],
  },
};
const link = (from: number | string, to: number | string, via = "HTTP", async = false) => ({
  from: typeof from === "number" ? tid(from) : from,
  to: typeof to === "number" ? tid(to) : to,
  via,
  async,
});
const linksReply = (links: unknown[], proposals: unknown[] = [], assignments: unknown[] = []) => ({
  output: { assignments, proposals, links },
});
const pending = (
  id: string,
  payload: Record<string, unknown>,
): PublishedProposal & {
  position: number;
} => ({
  id,
  kind: "component",
  zone: "Zone 1",
  title: String(payload.name),
  status: "pending",
  applied: false,
  payload: { type: "service", zone: "Zone 1", responsibility: "Relaie.", ...payload },
  position: 0,
});
const bySpecId = (bench: { store: { proposals: { payload: Record<string, unknown> }[] } }) =>
  bench.store.proposals.filter((p) => typeof p.payload.specId === "string");

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("coveragePass, liens (TK-114c, faux moteur Toto)", () => {
  it("liens proposés : composant de la même réponse, complément d'une proposition en attente, specId d'un indexé", async () => {
    const ai = new ScriptedAi(
      replies(
        linksReply(
          [
            link(4, 1),
            link("C-relais", 6, "gRPC"),
            link("C-passerelle", 7),
            link(1, 11),
            link(8, 9),
            link(9, 8),
            link(9, 8, "AMQP", true),
            link(10, 10),
            link(10, "C-inconnu"),
            link(1, 2, "TCP"),
          ],
          [panier({ name: "Relais", zone: "Zone 2", dependsOn: [{ to: tid(5), via: "HTTP" }] })],
        ),
      ),
    );
    const bench = benchOf(TOTO, ai);
    bench.store.proposals.push(
      pending("p-passerelle", { name: "Passerelle" }),
      pending("p-t01", { specId: tid(1), name: "Toto 1", serves: [] }),
    );
    expect(await coveragePass(bench.run, coverageIndexOf(TOTO))).toBe("cap");
    expect(ai.requests).toHaveLength(3);
    expect(JSON.stringify(ai.requests[0])).toContain(
      `Components without any dependency\\n${tid(4)} | Toto 4 | Zone 4 | service`,
    );
    const payloadOf = (title: string) =>
      bench.store.proposals.find((p) => p.title === title)?.payload;
    expect(payloadOf("Relais")?.dependsOn).toEqual([
      { to: tid(5), via: "HTTP" },
      { to: tid(6), via: "gRPC" },
    ]);
    expect(payloadOf("Passerelle")?.dependsOn).toEqual([{ to: tid(7), via: "HTTP" }]);
    expect(payloadOf("Toto 1")?.dependsOn).toEqual([
      { to: tid(2), via: "HTTP" },
      { to: tid(11), via: "HTTP" },
    ]);
    const updates = Object.fromEntries(
      bySpecId(bench).map((p) => [p.payload.specId, p.payload.dependsOn]),
    );
    expect(updates).toEqual({
      [tid(1)]: [
        { to: tid(2), via: "HTTP" },
        { to: tid(11), via: "HTTP" },
      ],
      [tid(4)]: [{ to: tid(1), via: "HTTP" }],
      [tid(8)]: [{ to: tid(9), via: "HTTP" }],
      [tid(9)]: [{ to: tid(8), via: "AMQP", async: true }],
    });
    expect(JSON.stringify(bench.store.proposals)).not.toContain("C-inconnu");
    expect(bench.store.state.coverageAfter?.links).toEqual({ covered: 12, total: 25 });
    expect(bench.store.state.coverageStalled).toBe(2);
  });

  it("arrêt completed quand plus aucun composant n'est isolé ; stalled remis à zéro", async () => {
    const towards = (from: number) => Array.from({ length: 10 }, (_, i) => link(from + i, 1));
    const ai = new ScriptedAi(replies(linksReply(towards(4)), linksReply(towards(14))));
    const bench = benchOf(TOTO, ai);
    expect(await coveragePass(bench.run, coverageIndexOf(TOTO))).toBe("completed");
    expect(ai.requests).toHaveLength(2);
    expect(bySpecId(bench)).toHaveLength(20);
    expect(bench.store.state.coverageAfter?.links).toEqual({ covered: 23, total: 23 });
    expect(bench.store.state).toMatchObject({ coverageCalls: 2, coverageStalled: 0 });
  });

  it("aucun lien retenu : stalled incrémenté, rien publié, cap après une passe complète", async () => {
    const ai = new ScriptedAi(replies(linksReply([link(3, 1), link(4, "C-inconnu"), link(2, 3)])));
    const bench = benchOf(TOTO, ai);
    expect(await coveragePass(bench.run, coverageIndexOf(TOTO))).toBe("cap");
    expect(ai.requests).toHaveLength(2);
    expect(bench.store.proposals).toHaveLength(0);
    expect(bench.store.state.coverageStalled).toBe(2);
  });

  it("affectation et lien d'un même indexé : une seule proposition specId (serves et dependsOn)", async () => {
    const sources = { ...TOTO, features: [{ specId: "F-001", title: "Payer", criteria: [] }] };
    const ai = new ScriptedAi(
      replies(linksReply([link(4, 1)], [], [{ feature: "F-001", component: tid(4) }])),
    );
    const bench = benchOf(sources, ai);
    await coveragePass(bench.run, coverageIndexOf(sources));
    const updates = bySpecId(bench).filter((p) => p.payload.specId === tid(4));
    expect(updates).toHaveLength(1);
    expect(updates[0]?.payload).toMatchObject({
      serves: ["F-001"],
      dependsOn: [{ to: tid(1), via: "HTTP" }],
    });
  });

  it("sortie sans links : tolérée (liste vide)", async () => {
    const ai = new ScriptedAi(replies({ output: { assignments: [], proposals: [] } }));
    const bench = benchOf(TOTO, ai);
    expect(await coveragePass(bench.run, coverageIndexOf(TOTO))).toBe("cap");
    expect(bench.store.state.discardedCount).toBe(0);
  });
});

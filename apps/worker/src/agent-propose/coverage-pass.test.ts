import { describe, expect, it } from "vitest";
import { benchOf, type Reply, ScriptedAi } from "../../test/support/propose-run.ts";
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
  roles: [{ specId: "RL-client", title: "Client" }],
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
      },
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

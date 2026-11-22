import type { CurrentArchflow, CurrentComponent } from "@koklo/db";
import { archflowProposalSchema } from "@koklo/schema";
import { describe, expect, it } from "vitest";
import { benchOf, ScriptedAi } from "../../test/support/propose-run.ts";
import {
  TOTO_APPS,
  TOTO_ARCHFLOWS,
  TOTO_COMPONENTS,
  TOTO_DATABASE,
  TOTO_SERVICES,
  TOTO_SOURCES,
} from "../../test/support/toto.ts";
import { type CoverageIndex, coverageIndexOf, type PublishedProposal } from "./coverage.ts";
import { architectureEnd } from "./generate.ts";
import { coverageCountsOf, REPRISE_RATIONALE, reprisePlan } from "./reprises.ts";

/**
 * TK-114d (B655 à B657) : flux repris par le code. Chaque message rôle → service devient rôle → application → service ;
 * proposition `archflow` avec le `specId` du flux indexé, validée par `archflowProposalSchema`, motifs d'écart comptés.
 */
const [ECRAN, PAGE] = TOTO_APPS as [string, string];

/** Toto dont les deux applications listent enfin les rôles (les quatre premiers à l'écran, l'invité à la page). */
const withActors = (components: readonly CurrentComponent[]): CurrentComponent[] =>
  components.map((component) =>
    component.specId === ECRAN
      ? {
          ...component,
          actors: ["RL-colocataire", "RL-admin-colocation", "RL-visiteur", "RL-gestionnaire"],
        }
      : component.specId === PAGE
        ? { ...component, actors: ["RL-invite"] }
        : component,
  );

const indexOf = (
  archflows: readonly CurrentArchflow[] = TOTO_ARCHFLOWS,
  components: readonly CurrentComponent[] = withActors(TOTO_COMPONENTS),
): CoverageIndex => ({
  ...coverageIndexOf(TOTO_SOURCES),
  components,
  archflows: archflows.map((flow) => flow.specId),
  technicalFlows: archflows,
});

const published = (
  payload: Record<string, unknown>,
  status = "pending",
  kind = "archflow",
): PublishedProposal => ({
  id: `p-${String(payload.specId ?? payload.name)}`,
  kind,
  zone: "Flux techniques",
  title: String(payload.flow ?? payload.name),
  status,
  applied: false,
  payload,
});

const archflowsOf = (plan: ReturnType<typeof reprisePlan>["plan"]) =>
  plan.creations.filter((candidate) => candidate.kind === "archflow");

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même règle, un test par comportement
describe("reprisePlan (B655, B657)", () => {
  it("Toto : 22 reprises P-…, rôle → application → service, participant ajouté après le rôle, schéma respecté", () => {
    const { plan, skipped } = reprisePlan(indexOf(), []);
    const flows = archflowsOf(plan);
    expect(flows).toHaveLength(22);
    expect(skipped.size).toBe(0);
    const [first] = flows;
    expect(first).toMatchObject({
      kind: "archflow",
      title: "P-parcours-01",
      zone: "Flux techniques",
      rationale: REPRISE_RATIONALE,
    });
    const service = TOTO_SERVICES[0];
    expect(first?.payload).toEqual({
      specId: "P-parcours-01",
      flow: "P-parcours-01",
      participants: ["RL-colocataire", ECRAN, service, TOTO_DATABASE],
      messages: [
        { from: "RL-colocataire", to: ECRAN, text: "Demande", reply: "Répond" },
        { from: ECRAN, to: service, text: "Demande", reply: "Répond" },
        { from: service, to: TOTO_DATABASE, text: "Enregistre" },
        {
          block: "alt",
          label: "Sinon · refus",
          messages: [
            { from: service, to: ECRAN, text: "Refuse", error: "Conflit (409)" },
            { from: ECRAN, to: "RL-colocataire", text: "Refuse" },
          ],
        },
      ],
    });
    for (const flow of flows) {
      expect(archflowProposalSchema.safeParse(flow.payload).success, flow.title).toBe(true);
      expect(String(flow.payload.specId)).toMatch(/^P-/);
    }
  });

  it("dépendance { to, via: appel } ajoutée à l'application (proposition specId), une fois par service", () => {
    const { plan } = reprisePlan(indexOf(), []);
    const ecran = plan.creations.find((c) => c.payload.specId === ECRAN);
    const deps = ecran?.payload.dependsOn as { to: string; via: string }[];
    expect(deps.every((dep) => dep.via === "appel")).toBe(true);
    expect(new Set(deps.map((dep) => dep.to)).size).toBe(deps.length);
    expect(ecran?.payload.actors).toBeUndefined();
    const page = plan.creations.find((c) => c.payload.specId === PAGE);
    expect(page?.payload.dependsOn).toEqual(
      [4, 9, 14, 19].map((i) => ({ to: TOTO_SERVICES[i % 19], via: "appel" })),
    );
  });

  it("dépendance qui fermerait un cycle synchrone omise, le flux reste repris (B657)", () => {
    const components = withActors(TOTO_COMPONENTS).map((c) =>
      c.specId === TOTO_SERVICES[4] ? { ...c, dependsOn: [{ to: PAGE, via: "HTTP" }] } : c,
    );
    const { plan } = reprisePlan(indexOf(TOTO_ARCHFLOWS, components), []);
    const page = plan.creations.find((c) => c.payload.specId === PAGE);
    const targets = ((page?.payload.dependsOn ?? []) as { to: string }[]).map((dep) => dep.to);
    expect(targets).not.toContain(TOTO_SERVICES[4]);
    expect(archflowsOf(plan).map((c) => c.title)).toContain("P-parcours-05");
  });

  it("rôle sans application : no_entry_app ; aucune reprise", () => {
    const { plan, skipped } = reprisePlan(indexOf(TOTO_ARCHFLOWS, TOTO_COMPONENTS), []);
    expect(plan.creations).toEqual([]);
    expect([...skipped]).toEqual([["no_entry_app", 22]]);
  });

  it("trop long : > 12 participants, > 60 éléments, > 20 messages dans un alt", () => {
    const [base] = TOTO_ARCHFLOWS as [CurrentArchflow];
    const message = { from: "C-service-01", to: TOTO_DATABASE, text: "Écrit" };
    const crowded = {
      ...base,
      specId: "P-foule",
      participants: [...(base.participants ?? []), ...TOTO_SERVICES.slice(1, 10)],
    };
    const long = {
      ...base,
      specId: "P-long",
      messages: [...(base.messages ?? []), ...Array.from({ length: 57 }, () => message)],
    };
    const alt = {
      ...base,
      specId: "P-alt",
      messages: [
        {
          block: "alt" as const,
          label: "Sinon",
          messages: Array.from({ length: 11 }, () => ({
            from: "C-service-01",
            to: "RL-colocataire",
            text: "Refuse",
          })),
        },
      ],
    };
    const { plan, skipped } = reprisePlan(indexOf([crowded, long, alt]), []);
    expect(archflowsOf(plan)).toEqual([]);
    expect([...skipped]).toEqual([["too_long", 3]]);
  });

  it("au-delà de 60 reprises par lancement : cap", () => {
    const many = Array.from({ length: 64 }, (_, i) => ({
      ...(TOTO_ARCHFLOWS[i % 22] as CurrentArchflow),
      specId: `P-flux-${i + 1}`,
    }));
    const { plan, skipped } = reprisePlan(indexOf(many), []);
    expect(archflowsOf(plan)).toHaveLength(60);
    expect([...skipped]).toEqual([["cap", 4]]);
  });

  it("reprise déjà proposée (refusée comprise) : jamais reproposée ; refusée : non couverte", () => {
    const refused = published({ specId: "P-parcours-01", flow: "P-parcours-01" }, "rejected");
    const pending = published({ specId: "P-parcours-02", flow: "P-parcours-02" });
    const { plan } = reprisePlan(indexOf(), [refused, pending]);
    const titles = archflowsOf(plan).map((c) => c.title);
    expect(titles).toHaveLength(20);
    expect(titles).not.toContain("P-parcours-01");
    expect(titles).not.toContain("P-parcours-02");
    expect(coverageCountsOf(indexOf(), [refused, pending]).reprises).toEqual({
      covered: 1,
      total: 22,
    });
  });

  it("un flux qui passe déjà par une application ou par un externe n'est pas repris", () => {
    const [base] = TOTO_ARCHFLOWS as [CurrentArchflow];
    const viaApp = {
      ...base,
      specId: "P-app",
      participants: ["RL-colocataire", ECRAN],
      messages: [{ from: "RL-colocataire", to: ECRAN, text: "Ouvre" }],
    };
    const viaExt = {
      ...base,
      specId: "P-ext",
      participants: ["RL-colocataire", "C-service-envoi"],
      messages: [{ from: "C-service-envoi", to: "RL-colocataire", text: "Écrit" }],
    };
    const { plan, skipped } = reprisePlan(indexOf([viaApp, viaExt]), []);
    expect(plan.creations).toEqual([]);
    expect(skipped.size).toBe(0);
    expect(coverageCountsOf(indexOf([viaApp, viaExt]), []).reprises).toEqual({
      covered: 0,
      total: 0,
    });
  });
});

describe("architectureEnd : reprise en fin d'Architecture (B656)", () => {
  const sources = {
    ...TOTO_SOURCES,
    architecture: { ...TOTO_SOURCES.architecture, components: withActors(TOTO_COMPONENTS) },
  } as typeof TOTO_SOURCES;

  it.each(["completed", "cap", "deadline"] as const)(
    "%s : 22 reprises publiées, bilan écrit",
    async (outcome) => {
      const bench = benchOf(sources, new ScriptedAi(() => ({ output: {} })));
      expect(await architectureEnd(bench.run, coverageIndexOf(sources), outcome)).toBe(outcome);
      expect(bench.store.proposals.filter((p) => p.kind === "archflow")).toHaveLength(22);
      expect(bench.store.state.coverageAfter?.reprises).toEqual({ covered: 22, total: 22 });
    },
  );

  it.each(["handoff", "stopped"] as const)("%s : rien n'est repris", async (outcome) => {
    const bench = benchOf(sources, new ScriptedAi(() => ({ output: {} })));
    expect(await architectureEnd(bench.run, coverageIndexOf(sources), outcome)).toBe(outcome);
    expect(bench.store.proposals).toEqual([]);
  });

  it("motifs d'écart écrits dans le bilan même sans reprise", async () => {
    const bench = benchOf(TOTO_SOURCES, new ScriptedAi(() => ({ output: {} })));
    await architectureEnd(bench.run, coverageIndexOf(TOTO_SOURCES), "completed");
    expect(bench.store.state.coverageAfter?.reprises).toEqual({
      covered: 0,
      total: 22,
      skipped: [{ reason: "no_entry_app", count: 22 }],
    });
    expect(bench.store.state.coverageAfter?.roles).toEqual({ covered: 0, total: 5 });
  });
});

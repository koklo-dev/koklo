import { componentProposalSchema } from "@koklo/schema";
import { describe, expect, it } from "vitest";
import type { CoverageIndex, IndexedComponent, PublishedProposal } from "./coverage.ts";
import { tablesPlan, updateProposalOf } from "./tables.ts";

/**
 * TK-114b (B614, B615) : les tables sans propriétaire sont rattachées par le code, sans appel au modèle. Ordre des
 * propriétaires : `C-base-de-donnees` (index ou lancement), premier `store` de l'index par identifiant, premier `store` en
 * attente du lancement, sinon une proposition « Base de données ». 200 tables au plus par composant.
 */
const tables = (n: number) => Array.from({ length: n }, (_, i) => `T-t${i}`);
const indexed = (specId: string, over: Partial<IndexedComponent> = {}): IndexedComponent => ({
  specId,
  title: specId.slice(2).toUpperCase(),
  zone: "Données",
  type: "store",
  owns: [],
  serves: [],
  ...over,
});
const index = (over: Partial<CoverageIndex> = {}): CoverageIndex => ({
  features: [],
  flows: [],
  tableIds: ["T-a", "T-b", "T-c"],
  components: [],
  archflows: [],
  ...over,
});
let next = 0;
const proposal = (
  payload: Record<string, unknown>,
  over: Partial<PublishedProposal> = {},
): PublishedProposal => {
  next += 1;
  return {
    id: `p-${next}`,
    kind: "component",
    zone: "Noyau",
    title: String(payload.name),
    status: "pending",
    applied: false,
    payload: { type: "service", zone: "Noyau", responsibility: "Fait.", ...payload },
    ...over,
  };
};

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("tablesPlan", () => {
  it("aucun composant : une seule proposition « Base de données » qui possède toutes les tables", () => {
    const plan = tablesPlan(index(), []);
    expect(plan.complements).toEqual([]);
    expect(plan.creations).toHaveLength(1);
    const [created] = plan.creations;
    expect(created).toMatchObject({
      kind: "component",
      title: "Base de données",
      zone: "Données",
      rationale: "Tables sans composant propriétaire.",
      payload: {
        name: "Base de données",
        type: "store",
        zone: "Données",
        responsibility: "Garde les tables du modèle de données.",
        owns: ["T-a", "T-b", "T-c"],
      },
    });
    expect(componentProposalSchema.safeParse(created?.payload).success).toBe(true);
  });

  it("table déjà possédée (index ou proposition non refusée) : son propriétaire la garde", () => {
    const owner = indexed("C-api", { type: "service", owns: ["T-a"] });
    const pending = proposal({ name: "Cache", owns: ["T-b"] });
    const rejected = proposal({ name: "Vieux", owns: ["T-c"] }, { status: "rejected" });
    const plan = tablesPlan(index({ components: [owner] }), [pending, rejected]);
    expect(plan.creations.map((c) => c.payload.owns)).toEqual([["T-c"]]);
  });

  it("C-base-de-donnees de l'index d'abord : proposition specId, owns = index ∪ ajouts, nom et type de l'index", () => {
    const db = indexed("C-base-de-donnees", {
      title: "Base de données",
      owns: ["T-a"],
      serves: ["F-001"],
    });
    const plan = tablesPlan(index({ components: [indexed("C-aaa"), db] }), []);
    expect(plan.creations).toHaveLength(1);
    expect(plan.creations[0]?.payload).toMatchObject({
      specId: "C-base-de-donnees",
      name: "Base de données",
      type: "store",
      owns: ["T-a", "T-b", "T-c"],
      serves: ["F-001"],
    });
    expect(componentProposalSchema.safeParse(plan.creations[0]?.payload).success).toBe(true);
  });

  it("sinon le premier store de l'index par identifiant ; une proposition specId en attente est complétée", () => {
    const stores = [indexed("C-zeta"), indexed("C-beta"), indexed("C-api", { type: "service" })];
    expect(tablesPlan(index({ components: stores }), []).creations[0]?.payload.specId).toBe(
      "C-beta",
    );
    const waiting = proposal({ specId: "C-beta", name: "BETA", type: "store", owns: [] });
    const plan = tablesPlan(index({ components: stores }), [waiting]);
    expect(plan.creations).toEqual([]);
    expect(plan.complements).toEqual([{ id: waiting.id, owns: ["T-a", "T-b", "T-c"], serves: [] }]);
  });

  it("une proposition « Base de données » en attente du lancement passe avant les stores de l'index", () => {
    const waiting = proposal({ name: "Base de données", type: "store" });
    const plan = tablesPlan(index({ components: [indexed("C-beta")] }), [waiting]);
    expect(plan.complements).toEqual([{ id: waiting.id, owns: ["T-a", "T-b", "T-c"], serves: [] }]);
  });

  it("sans store indexé : le premier store en attente du lancement ; une proposition décidée n'est jamais complétée", () => {
    const accepted = proposal({ name: "Archive", type: "store" }, { status: "accepted" });
    const applied = proposal({ name: "Journal", type: "store" }, { applied: true });
    const waiting = proposal({ name: "Stock", type: "store" });
    const plan = tablesPlan(index(), [accepted, applied, waiting]);
    expect(plan.complements).toEqual([{ id: waiting.id, owns: ["T-a", "T-b", "T-c"], serves: [] }]);
  });

  it("plus de 200 tables : « Base de données », puis « Base de données 2 »… 200 au plus chacune", () => {
    const plan = tablesPlan(index({ tableIds: tables(450) }), []);
    expect(plan.creations.map((c) => [c.title, (c.payload.owns as string[]).length])).toEqual([
      ["Base de données", 200],
      ["Base de données 2", 200],
      ["Base de données 3", 50],
    ]);
  });

  it("toutes les tables possédées : rien à faire", () => {
    const owner = indexed("C-db", { owns: ["T-a", "T-b", "T-c"] });
    expect(tablesPlan(index({ components: [owner] }), [])).toEqual({
      creations: [],
      complements: [],
    });
  });
});

/** TK-114c (B636) : proposition `specId` qui porte des liens : dependsOn = index ∪ ajouts (clé `to`), 30 au plus. */
describe("updateProposalOf, dépendances", () => {
  const api = indexed("C-api", {
    type: "service",
    dependsOn: [{ to: "C-db", via: "SQL" }],
  });

  it("dependsOn = index ∪ ajouts, sans doublon de cible, 30 au plus", () => {
    const added = Array.from({ length: 35 }, (_, i) => ({ to: `C-c${i}`, via: "HTTP" }));
    const update = updateProposalOf(
      api,
      {
        dependsOn: [
          { to: "C-db", via: "TCP" },
          { to: "C-bus", via: "AMQP", async: true },
          ...added,
        ],
      },
      "Liens",
    );
    const deps = update?.payload.dependsOn as { to: string }[];
    expect(deps).toHaveLength(30);
    expect(deps.slice(0, 2)).toEqual([
      { to: "C-db", via: "SQL" },
      { to: "C-bus", via: "AMQP", async: true },
    ]);
    expect(componentProposalSchema.safeParse(update?.payload).success).toBe(true);
  });

  it("sans dépendance ajoutée : dependsOn omis (B637, propositions de TK-114b inchangées)", () => {
    expect(updateProposalOf(api, { serves: ["F-001"] }, "Liens")?.payload).not.toHaveProperty(
      "dependsOn",
    );
  });

  it("TK-114d (B653) : actors = index ∪ ajouts, 20 au plus ; sans rôle ajouté : actors omis", () => {
    const app = indexed("C-web", { type: "app", actors: ["RL-a"] });
    const roles = Array.from({ length: 25 }, (_, i) => `RL-r${i}`);
    const update = updateProposalOf(app, { actors: ["RL-a", ...roles] }, "Rôles");
    const actors = update?.payload.actors as string[];
    expect(actors).toHaveLength(20);
    expect(actors[0]).toBe("RL-a");
    expect(componentProposalSchema.safeParse(update?.payload).success).toBe(true);
    expect(updateProposalOf(app, { serves: ["F-001"] }, "Liens")?.payload).not.toHaveProperty(
      "actors",
    );
  });
});

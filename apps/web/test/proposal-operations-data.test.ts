import { describe, expect, it } from "vitest";
import { prepareDataProposals, tableRefOf } from "../src/lib/proposal-data.ts";
import { isSavable, operationsOf, planBatches } from "../src/lib/proposal-operations.ts";
import { fake } from "./support/proposals.tsx";

/** TK-107 lot C (B387, B392) : opérations des propositions `table`, `relations`, `fixtures` et rejet en cascade. */
const table = (n: number, name: string, over: Record<string, unknown> = {}, status = "accepted") =>
  fake(n, {
    kind: "table",
    zone: "Prise de rendez-vous",
    title: name,
    status: status as "accepted",
    content: {
      name,
      description: `Table ${name}`,
      sources: ["F-001"],
      fields: [
        { name: "id", type: "uuid", primaryKey: true },
        { name: "client_id", type: "ref(T-client)" },
      ],
      ...over,
    },
  });
const relations = (n: number, list: unknown[], status = "accepted") =>
  fake(n, {
    kind: "relations",
    zone: "",
    title: "Relations",
    status: status as "accepted",
    content: { relations: list },
  });

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("opérations des Données", () => {
  it("l'identifiant d'une table est T-<slug du nom>", () => {
    expect(tableRefOf("Réservation")).toBe("T-reservation");
    expect(tableRefOf("Liste d'attente")).toBe("T-liste-d-attente");
  });

  it("table -> table.create : nom, zone de la proposition, description, sources, champs", () => {
    const [op] = operationsOf(table(1, "Réservation"));
    expect(op).toEqual({
      kind: "table.create",
      name: "Réservation",
      zone: "Prise de rendez-vous",
      description: "Table Réservation",
      sources: ["F-001"],
      fields: [
        { name: "id", type: "uuid", primaryKey: true },
        { name: "client_id", type: "ref(T-client)" },
      ],
    });
  });

  it("fixtures -> fixture.create avec la locale et les lignes", () => {
    const [op] = operationsOf(
      fake(1, {
        kind: "fixtures",
        title: "Clients",
        content: { title: "Clients", table: "T-client", locale: "fr-FR", rows: [{ nom: "Léa" }] },
      }),
    );
    expect(op).toEqual({
      kind: "fixture.create",
      title: "Clients",
      table: "T-client",
      locale: "fr-FR",
      rows: [{ nom: "Léa" }],
    });
  });

  it("relations -> une opération par table de départ absente du lot, sans opération pour les autres", () => {
    const rel = fake(3, {
      kind: "relations",
      status: "accepted",
      content: {
        relations: [{ from: "T-reservation", to: "T-client", cardinality: "n → 1" }],
        updates: [{ specId: "T-creneau", relations: [{ to: "T-service", cardinality: "n → 1" }] }],
      },
    });
    expect(operationsOf(rel)).toEqual([
      {
        kind: "table.update",
        specId: "T-creneau",
        relations: [{ to: "T-service", cardinality: "n → 1" }],
      },
    ]);
  });

  it("isSavable : une proposition de relations sans mise à jour n'est pas enregistrable", () => {
    expect(isSavable(relations(1, [{ from: "T-a", to: "T-b", cardinality: "n → 1" }]))).toBe(false);
    expect(isSavable(table(1, "Client"))).toBe(true);
  });

  it("un lot unique garde l'ordre table, relations, jeu et tous les identifiants de proposition", () => {
    const a = table(1, "Client");
    const b = fake(2, {
      kind: "relations",
      status: "accepted",
      content: {
        updates: [{ specId: "T-creneau", relations: [{ to: "T-client", cardinality: "n → 1" }] }],
      },
    });
    const c = fake(3, {
      kind: "fixtures",
      status: "accepted",
      content: { title: "Clients", table: "T-client", rows: [{ nom: "Léa" }] },
    });
    const [plan, ...rest] = planBatches("L", [a, b, c]);
    expect(rest).toHaveLength(0);
    expect(plan?.proposalIds).toEqual([a.id, b.id, c.id]);
    expect(plan?.operations.map((op) => op.kind)).toEqual([
      "table.create",
      "table.update",
      "fixture.create",
    ]);
  });
});

describe("prepareDataProposals : relations et rejet en cascade (B392)", () => {
  const none = async () => [];

  it("les relations de la table du lot passent dans son table.create (relationsOut)", async () => {
    const reservation = table(1, "Réservation");
    const client = table(2, "Client", { fields: [{ name: "id", type: "uuid", primaryKey: true }] });
    const rel = relations(3, [{ from: "T-reservation", to: "T-client", cardinality: "n → 1" }]);
    const { proposals } = await prepareDataProposals([reservation, client, rel], none);
    const [op] = operationsOf(proposals[0] ?? reservation);
    expect(op).toMatchObject({
      kind: "table.create",
      relations: [{ to: "T-client", cardinality: "n → 1" }],
    });
    expect(proposals.filter(isSavable).map((p) => p.kind)).toEqual(["table", "table"]);
  });

  it("une relation partant d'une table enregistrée devient un table.update qui garde les relations existantes", async () => {
    const rel = relations(1, [{ from: "T-creneau", to: "T-service", cardinality: "n → 1" }]);
    const { proposals } = await prepareDataProposals([rel], async (id) =>
      id === "T-creneau" ? [{ to: "T-salon", cardinality: "n → 1" }] : [],
    );
    expect(operationsOf(proposals[0] ?? rel)).toEqual([
      {
        kind: "table.update",
        specId: "T-creneau",
        relations: [
          { to: "T-salon", cardinality: "n → 1" },
          { to: "T-service", cardinality: "n → 1" },
        ],
      },
    ]);
  });

  it("rejeter une table retire les relations et les champs ref qui la visent, et le dit", async () => {
    const client = table(1, "Client", {}, "rejected");
    const reservation = table(2, "Réservation");
    const rel = relations(3, [
      { from: "T-reservation", to: "T-client", cardinality: "n → 1" },
      { from: "T-reservation", to: "T-service", cardinality: "n → 1" },
    ]);
    const { proposals, cascade } = await prepareDataProposals([client, reservation, rel], none);
    expect(cascade).toEqual({ relations: 1, fields: 1 });
    const adjusted = proposals.find((p) => p.id === reservation.id);
    expect(operationsOf(adjusted ?? reservation)[0]).toMatchObject({
      fields: [{ name: "id", type: "uuid", primaryKey: true }],
      relations: [{ to: "T-service", cardinality: "n → 1" }],
    });
  });

  it("sans table rejetée, rien n'est retiré", async () => {
    const { cascade } = await prepareDataProposals([table(1, "Réservation")], none);
    expect(cascade).toEqual({ relations: 0, fields: 0 });
  });
});

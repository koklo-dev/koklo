import { describe, expect, it } from "vitest";
import { securityImpactOf } from "../spec-deliverables/deliverable-upstream.ts";
import { loadWindow } from "../tracker/long-list.ts";
import { contextView, dataRows, dataSource, filteredRows } from "./data-values.ts";
import type { IndexRow } from "./security-values.ts";

/** TK-117 lot B (B805, B808) : liste des données calculée depuis l'index, curseurs des deux côtés, impact amont. */
const table = (id: string, fields: string[]): IndexRow => ({
  kind: "table",
  specId: id,
  path: `data/tables/${id}.yaml`,
  data: { champs: fields.map((nom) => ({ nom })) },
});
const ROWS = [table("T-t", ["a", "b", "c", "d", "e"])];

describe("dataSource", () => {
  it("page suivante puis précédente, sans doublon ni trou", async () => {
    const rows = dataRows(ROWS);
    const source = dataSource(rows, rows);
    const first = await loadWindow(source, { limit: 2 });
    const second = await loadWindow(source, { limit: 2, cursor: first.nextCursor as string });
    expect(second.rows.map((row) => row.field)).toEqual(["t.c", "t.d"]);
    expect(second.offset).toBe(2);
    const back = await loadWindow(source, { limit: 2, cursor: second.previousCursor as string });
    expect(back.rows.map((row) => row.field)).toEqual(["t.a", "t.b"]);
  });

  it("recherche sans casse ; contexte inconnu : à préciser", () => {
    expect(filteredRows(dataRows(ROWS), { q: " T.C " }).map((row) => row.field)).toEqual(["t.c"]);
    expect(contextView(ROWS)).toEqual({ hosting: [], subprocessors: [], transfers: null });
  });
});

describe("securityImpactOf", () => {
  const facts = {
    atDecision: new Map([
      ["ST-sms", "1"],
      ["T-t", "1"],
      ["RL-a", "1"],
    ]),
    atHead: new Map([
      ["ST-sms", "1"],
      ["T-t", "2"],
      ["z.lire", "1"],
    ]),
    fields: { atDecision: new Set(["t.a"]), atHead: new Set(["t.a", "t.b"]) },
    threats: [
      { id: "SEC-T01", links: ["t.a"] },
      { id: "SEC-T02", links: ["ST-sms"] },
      { id: "SEC-T03", links: ["RL-a"] },
    ],
  };

  it("changements, menaces citant un élément changé (champ d'une table changée) et champs nouveaux", () => {
    expect(securityImpactOf(facts)).toEqual({
      changes: [
        { id: "RL-a", change: "removed" },
        { id: "T-t", change: "changed" },
        { id: "z.lire", change: "added" },
      ],
      items: ["SEC-T01", "SEC-T03", "t.b"],
    });
  });

  it("sans décision comparable : aucun impact", () => {
    const none = { changes: [], items: [] };
    expect(securityImpactOf(null)).toEqual(none);
    expect(securityImpactOf({ ...facts, atDecision: null })).toEqual(none);
  });
});

import { describe, expect, it } from "vitest";
import type { PrismaClient } from "../src/generated/client.ts";
import {
  entitiesReferencing,
  likePrefixOf,
  MissingOrganizationContextError,
  searchEntityIds,
  searchEntityRefs,
  tableRelationCounts,
  tableRelationTotal,
  tableZoneFacets,
  withOrganization,
} from "../src/index.ts";

/** TK-101 : le motif de préfixe neutralise les jokers, et les lectures de `spec_entities` exigent une organisation. */
describe("likePrefixOf", () => {
  it.each([
    ["F-98", "F-98%"],
    ["", "%"],
    ["100%", "100\\%%"],
    ["a_b", "a\\_b%"],
    ["a\\b", "a\\\\b%"],
  ])("%j -> %j", (input, expected) => {
    expect(likePrefixOf(input)).toBe(expected);
  });
});

describe("lectures de spec_entities", () => {
  const raw = {
    $queryRaw: () => {
      throw new Error("ne doit pas être appelé");
    },
  } as unknown as PrismaClient;

  it("refusent hors contexte d'organisation, avant toute requête", async () => {
    await expect(searchEntityRefs(raw, "s", ["feature"], "F-1", 20)).rejects.toThrow(
      MissingOrganizationContextError,
    );
    await expect(entitiesReferencing(raw, "s", "F-003", 20)).rejects.toThrow(
      MissingOrganizationContextError,
    );
    await expect(searchEntityIds(raw, "s", "rule", "R-250")).rejects.toThrow(
      MissingOrganizationContextError,
    );
  });
});

/** TK-107 (B388) : la recherche d'un tableau de tables couvre aussi le nom des champs, par une requête paramétrée. */
describe("searchEntityIds : tables par nom de champ", () => {
  const capture = () => {
    const calls: { sql: string; values: unknown[] }[] = [];
    const raw = {
      $queryRaw: (strings: TemplateStringsArray, ...values: unknown[]) => {
        calls.push({ sql: strings.join("?"), values });
        return Promise.resolve([{ id: "row-1" }]);
      },
    } as unknown as PrismaClient;
    return { raw, calls };
  };
  const ORG = "11111111-1111-4111-8111-111111111111";

  it("kind table : un champ du contenu dont le nom contient la saisie est cherché, la saisie reste un paramètre", async () => {
    const { raw, calls } = capture();
    const ids = await withOrganization(ORG, () =>
      searchEntityIds(raw, "snap", "table", "e-mail'; DROP TABLE x; --"),
    );
    expect(ids).toEqual(["row-1"]);
    const [call] = calls;
    expect(call?.sql).toContain("jsonb_array_elements");
    expect(call?.sql).toContain("'champs'");
    expect(call?.sql).not.toContain("DROP TABLE");
    expect(call?.values).toContain("table");
    expect(
      call?.values.some((value) => typeof value === "string" && value.includes("DROP TABLE")),
    ).toBe(true);
  });

  it("le motif de champ neutralise les jokers de la saisie", async () => {
    const { raw, calls } = capture();
    await withOrganization(ORG, () => searchEntityIds(raw, "snap", "table", "100%_x"));
    const patterns =
      calls[0]?.values.filter((value): value is string => typeof value === "string") ?? [];
    expect(patterns).toContain("%100\\%\\_x%");
  });
});

/** TK-107 (B384, B388) : relations comptées des deux côtés et facettes de zone des tables, lectures paramétrées de `spec_entities`. */
describe("lectures agrégées des tables", () => {
  const ORG = "11111111-1111-4111-8111-111111111111";
  const capture = (rows: unknown[]) => {
    const calls: { sql: string; values: unknown[] }[] = [];
    const raw = {
      $queryRaw: (strings: TemplateStringsArray, ...values: unknown[]) => {
        calls.push({ sql: strings.join("?"), values });
        return Promise.resolve(rows);
      },
    } as unknown as PrismaClient;
    return { raw, calls };
  };

  it("refusent hors contexte d'organisation, avant toute requête", async () => {
    const { raw, calls } = capture([]);
    await expect(tableRelationCounts(raw, "s", ["a"])).rejects.toThrow(
      MissingOrganizationContextError,
    );
    await expect(tableRelationTotal(raw, "s")).rejects.toThrow(MissingOrganizationContextError);
    await expect(tableZoneFacets(raw, "s", null)).rejects.toThrow(MissingOrganizationContextError);
    expect(calls).toEqual([]);
  });

  it("tableRelationCounts : déclarées + entrantes par table, identifiants de ligne liés en paramètre", async () => {
    const { raw, calls } = capture([{ id: "row-1", n: 2 }]);
    const counts = await withOrganization(ORG, () => tableRelationCounts(raw, "snap", ["row-1"]));
    expect(counts).toEqual(new Map([["row-1", 2]]));
    expect(calls[0]?.sql).toContain("'relations'");
    expect(calls[0]?.values).toContainEqual(["row-1"]);
  });

  it("B476 : les clés ref(T-…) comptent, une fois par paire de tables, sans boucle", async () => {
    const { raw, calls } = capture([{ n: 44 }]);
    expect(await withOrganization(ORG, () => tableRelationTotal(raw, "snap"))).toBe(44);
    const sql = calls[0]?.sql ?? "";
    expect(sql).toContain("'champs'");
    expect(sql).toContain("^ref\\((T-[a-z0-9-]+)\\)$");
    expect(sql).toContain("UNION");
    expect(sql).toContain("dst <> src");
  });

  it("tableRelationTotal : relations de l'instantané ; tableZoneFacets : comptes par zone", async () => {
    const total = capture([{ n: 79 }]);
    expect(await withOrganization(ORG, () => tableRelationTotal(total.raw, "snap"))).toBe(79);
    const facets = capture([
      { zone: "Clients", n: 10 },
      { zone: "Paiements", n: 5 },
    ]);
    expect(await withOrganization(ORG, () => tableZoneFacets(facets.raw, "snap", null))).toEqual({
      Clients: 10,
      Paiements: 5,
    });
  });
});

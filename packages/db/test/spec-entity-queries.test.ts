import { describe, expect, it } from "vitest";
import type { PrismaClient } from "../src/generated/client.ts";
import {
  entitiesReferencing,
  likePrefixOf,
  MissingOrganizationContextError,
  searchEntityIds,
  searchEntityRefs,
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

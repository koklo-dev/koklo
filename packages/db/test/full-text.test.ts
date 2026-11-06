import { describe, expect, it } from "vitest";
import type { PrismaClient } from "../src/generated/client.ts";
import { MissingOrganizationContextError, searchIds, tsqueryOf } from "../src/index.ts";

/** TK-94 : la saisie n'est jamais de la syntaxe tsquery, et la recherche exige une organisation. */
describe("tsqueryOf", () => {
  it.each([
    ["annulation groupée", "annulation & groupée:*"],
    ["annul", "annul:*"],
    ["  F-187  ", "F & 187:*"],
    ["gérer   les\tpaiements", "gérer & les & paiements:*"],
  ])("%j -> %j", (input, expected) => {
    expect(tsqueryOf(input)).toBe(expected);
  });

  it.each(["& | ! ( ) : '", "***", "<->", "\\", "'; DROP TABLE tickets; --", "a:*) | (b"])(
    "neutralise la syntaxe tsquery de %j",
    (input) => {
      const query = tsqueryOf(input);
      expect(query === null || /^[\p{L}\p{N}]+( & [\p{L}\p{N}]+)*(:\*)?$/u.test(query)).toBe(true);
    },
  );

  it("rien de cherchable -> null", () => {
    expect(tsqueryOf("")).toBeNull();
    expect(tsqueryOf("& | ! ( ) : '")).toBeNull();
  });
});

describe("searchIds", () => {
  it("refuse hors contexte d'organisation, avant toute requête", async () => {
    const raw = {
      $queryRaw: () => {
        throw new Error("ne doit pas être appelé");
      },
    } as unknown as PrismaClient;
    await expect(searchIds(raw, "ticket", "p", "annul")).rejects.toThrow(
      MissingOrganizationContextError,
    );
  });
});

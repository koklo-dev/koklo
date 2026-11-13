import { describe, expect, it } from "vitest";
import { STALE_UPSTREAM_MAX, staleUpstreamOf, type UpstreamFacts } from "./deliverable-upstream.ts";

/**
 * TK-109 (B449) : impact amont du livrable Données. Les fonctionnalités et règles citées par `source:` des tables, dont le
 * contenu (hachage) a changé entre la tête de la dernière décision et la tête courante, rendent le livrable « À revoir ».
 * Jamais décidé, ou décision hors index : aucun impact.
 */
const facts = (over: Partial<UpstreamFacts> = {}): UpstreamFacts => ({
  sources: ["F-002", "R-004", "F-001"],
  atDecision: new Map([
    ["F-001", "h1"],
    ["F-002", "h2"],
    ["R-004", "h4"],
  ]),
  atHead: new Map([
    ["F-001", "h1"],
    ["F-002", "h2"],
    ["R-004", "h4"],
  ]),
  ...over,
});

describe("staleUpstreamOf", () => {
  it("aucun amont modifié : aucun impact", () => {
    expect(staleUpstreamOf(facts())).toEqual([]);
  });

  it("F-002 et R-004 modifiées après la décision : les deux, dans l'ordre des identifiants", () => {
    const atHead = new Map([
      ["F-001", "h1"],
      ["F-002", "autre"],
      ["R-004", "autre"],
    ]);
    expect(staleUpstreamOf(facts({ atHead }))).toEqual(["F-002", "R-004"]);
  });

  it("un amont retiré de la tête compte comme modifié", () => {
    const atHead = new Map([
      ["F-001", "h1"],
      ["R-004", "h4"],
    ]);
    expect(staleUpstreamOf(facts({ atHead }))).toEqual(["F-002"]);
  });

  it("une source citée depuis la décision (absente alors) n'est pas un impact", () => {
    const atDecision = new Map([["F-001", "h1"]]);
    expect(staleUpstreamOf(facts({ atDecision }))).toEqual([]);
  });

  it("jamais décidé ou décision hors index : aucun impact", () => {
    const atHead = new Map([["F-002", "autre"]]);
    expect(staleUpstreamOf(facts({ atDecision: null, atHead }))).toEqual([]);
    expect(staleUpstreamOf(null)).toEqual([]);
  });

  it("une source citée deux fois n'apparaît qu'une fois", () => {
    const atHead = new Map([["F-002", "autre"]]);
    expect(staleUpstreamOf(facts({ sources: ["F-002", "F-002"], atHead }))).toEqual(["F-002"]);
  });

  it("vingt identifiants au plus, les premiers dans l'ordre", () => {
    const ids = Array.from({ length: 25 }, (_, i) => `F-${String(i + 1).padStart(3, "0")}`);
    const atDecision = new Map(ids.map((id) => [id, "a"]));
    const result = staleUpstreamOf({ sources: ids, atDecision, atHead: new Map() });
    expect(result).toHaveLength(STALE_UPSTREAM_MAX);
    expect(result[0]).toBe("F-001");
  });
});

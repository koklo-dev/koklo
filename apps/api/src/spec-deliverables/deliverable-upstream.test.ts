import { describe, expect, it } from "vitest";
import {
  STALE_ARTIFACTS_MAX,
  STALE_UPSTREAM_MAX,
  staleImpactOf,
  staleUpstreamOf,
  type UpstreamFacts,
} from "./deliverable-upstream.ts";

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

/**
 * TK-113 (lot A) : impact amont de l'Architecture. Les fonctionnalités, règles et tables citées par les composants et les flux
 * (`sert`, `possede`, `fonctionnalites`, `regles`) rendent le livrable « À revoir » quand leur contenu change, quand une
 * table est ajoutée ou retirée ; `components` et `flows` disent quels éléments sont concernés.
 */
const architecture = (over: Partial<UpstreamFacts> = {}): UpstreamFacts => ({
  sources: ["F-001", "R-004", "T-user"],
  atDecision: new Map([
    ["F-001", "h1"],
    ["R-004", "h4"],
    ["T-user", "ht"],
  ]),
  atHead: new Map([
    ["F-001", "h1"],
    ["R-004", "h4"],
    ["T-user", "ht"],
  ]),
  tables: { atDecision: new Set(["T-user"]), atHead: new Set(["T-user"]) },
  citedBy: new Map([
    ["F-001", { components: ["C-web", "C-api"], flows: ["P-signup"] }],
    ["R-004", { components: [], flows: ["P-signup", "P-pay"] }],
    ["T-user", { components: ["C-db"], flows: [] }],
  ]),
  ...over,
});
const changed =
  (id: string, hash = "autre") =>
  (base: UpstreamFacts) =>
    new Map([...base.atHead, [id, hash]]);

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même fonction, un test par comportement
describe("staleImpactOf : Architecture (TK-113)", () => {
  it("rien ne bouge : aucun impact, aucun élément concerné", () => {
    expect(staleImpactOf(architecture())).toEqual({ upstream: [], components: [], flows: [] });
  });

  it("une table modifiée : l'amont T- et les composants qui la possèdent", () => {
    const base = architecture();
    expect(staleImpactOf({ ...base, atHead: changed("T-user")(base) })).toEqual({
      upstream: ["T-user"],
      components: ["C-db"],
      flows: [],
    });
  });

  it("une fonctionnalité modifiée : composants et flux concernés, triés et sans doublon", () => {
    const base = architecture();
    const atHead = changed("F-001")(base);
    const impact = staleImpactOf({ ...base, atHead });
    expect(impact).toEqual({
      upstream: ["F-001"],
      components: ["C-api", "C-web"],
      flows: ["P-signup"],
    });
  });

  it("deux amonts qui touchent le même flux : le flux n'apparaît qu'une fois", () => {
    const base = architecture();
    const atHead = new Map([...changed("F-001")(base), ["R-004", "autre"]]);
    expect(staleImpactOf({ ...base, atHead }).flows).toEqual(["P-pay", "P-signup"]);
  });

  it("table ajoutée depuis la décision : amont T- sans composant concerné", () => {
    const base = architecture();
    const tables = {
      atDecision: base.tables?.atDecision ?? null,
      atHead: new Set(["T-user", "T-order"]),
    };
    expect(staleImpactOf({ ...base, tables })).toEqual({
      upstream: ["T-order"],
      components: [],
      flows: [],
    });
  });

  it("table retirée depuis la décision : amont T- et composants qui la citaient", () => {
    const base = architecture();
    const tables = { atDecision: new Set(["T-user", "T-gone"]), atHead: new Set(["T-user"]) };
    const citedBy = new Map([
      ...(base.citedBy ?? []),
      ["T-gone", { components: ["C-old"], flows: [] }],
    ]);
    expect(staleImpactOf({ ...base, tables, citedBy })).toEqual({
      upstream: ["T-gone"],
      components: ["C-old"],
      flows: [],
    });
  });

  it("décision hors index (snapshot absent) : aucune table ajoutée ni retirée", () => {
    const base = architecture();
    const tables = { atDecision: null, atHead: new Set(["T-user", "T-order"]) };
    expect(staleImpactOf({ ...base, tables, atDecision: null })).toEqual({
      upstream: [],
      components: [],
      flows: [],
    });
  });

  it("jamais décidé : aucun impact", () => {
    expect(staleImpactOf(null)).toEqual({ upstream: [], components: [], flows: [] });
  });

  it("plafonds : 20 amonts, 50 composants, 50 flux, les premiers dans l'ordre", () => {
    const ids = Array.from({ length: 60 }, (_, i) => `F-${String(i + 1).padStart(3, "0")}`);
    const citedBy = new Map(
      ids.map((id, i) => [
        id,
        {
          components: [`C-c${String(i).padStart(2, "0")}`],
          flows: [`P-p${String(i).padStart(2, "0")}`],
        },
      ]),
    );
    const impact = staleImpactOf({
      sources: ids,
      atDecision: new Map(ids.map((id) => [id, "a"])),
      atHead: new Map(),
      citedBy,
    });
    expect(impact.upstream).toHaveLength(STALE_UPSTREAM_MAX);
    expect(impact.components).toHaveLength(STALE_ARTIFACTS_MAX);
    expect(impact.flows).toHaveLength(STALE_ARTIFACTS_MAX);
    expect(impact.components[0]).toBe("C-c00");
  });

  it("les Données restent inchangées : sans tables ni citations, mêmes amonts qu'avant", () => {
    const atHead = new Map([
      ["F-001", "h1"],
      ["F-002", "autre"],
      ["R-004", "h4"],
    ]);
    expect(staleImpactOf(facts({ atHead }))).toEqual({
      upstream: ["F-002"],
      components: [],
      flows: [],
    });
  });
});

import { describe, expect, it } from "vitest";
import {
  STALE_ARTIFACTS_MAX,
  STALE_UPSTREAM_MAX,
  staleImpactOf,
  staleUpstreamOf,
  type TechnicalUpstreamFacts,
  technicalImpactOf,
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

/**
 * TK-115 (B735) : impact de l'architecture sur le cahier technique. Composants et décisions comparés entre la tête de la
 * dernière décision et la tête courante ; éléments concernés : les choix, opérations et exigences qui les citent.
 */
describe("technicalImpactOf", () => {
  const at = (hash: string, accepted = false) => ({ hash, accepted });
  const facts = (over: Partial<TechnicalUpstreamFacts> = {}): TechnicalUpstreamFacts => ({
    atDecision: new Map([
      ["C-api", at("a")],
      ["C-old", at("o")],
      ["ADR-006", at("p")],
    ]),
    atHead: new Map([
      ["C-api", at("a")],
      ["C-old", at("o")],
      ["ADR-006", at("p")],
    ]),
    citing: [
      { id: "ST-sms", cites: ["C-sms", "ADR-006"] },
      { id: "avis.create", cites: ["C-avis"] },
      { id: "NFR-004", cites: ["C-api"] },
    ],
    ...over,
  });

  it("rien n'a changé, jamais décidé ou tête non indexée : aucun impact", () => {
    const none = { changes: [], items: [] };
    expect(technicalImpactOf(facts())).toEqual(none);
    expect(technicalImpactOf(null)).toEqual(none);
    expect(technicalImpactOf(facts({ atDecision: null }))).toEqual(none);
  });

  it("composant ajouté, retiré, modifié et décision acceptée ; éléments qui les citent", () => {
    const atHead = new Map([
      ["C-api", at("a2")],
      ["C-avis", at("n")],
      ["ADR-006", at("q", true)],
    ]);
    expect(technicalImpactOf(facts({ atHead }))).toEqual({
      changes: [
        { id: "ADR-006", change: "accepted" },
        { id: "C-api", change: "changed" },
        { id: "C-avis", change: "added" },
        { id: "C-old", change: "removed" },
      ],
      items: ["NFR-004", "ST-sms", "avis.create"],
    });
  });

  it("une décision déjà acceptée puis retouchée est « modifiée »", () => {
    const atDecision = new Map([["ADR-001", at("a", true)]]);
    const atHead = new Map([["ADR-001", at("b", true)]]);
    expect(technicalImpactOf(facts({ atDecision, atHead })).changes).toEqual([
      { id: "ADR-001", change: "changed" },
    ]);
  });

  it("cinquante changements et cinquante éléments au plus", () => {
    const ids = Array.from({ length: 60 }, (_, i) => `C-${String(i).padStart(3, "0")}`);
    const atHead = new Map(ids.map((id) => [id, at("n")]));
    const citing = ids.map((id, i) => ({ id: `NFR-${i + 100}`, cites: [id] }));
    const impact = technicalImpactOf(facts({ atDecision: new Map(), atHead, citing }));
    expect(impact.changes).toHaveLength(STALE_ARTIFACTS_MAX);
    expect(impact.items).toHaveLength(STALE_ARTIFACTS_MAX);
  });
});

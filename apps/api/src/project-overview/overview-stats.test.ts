import { describe, expect, it } from "vitest";
import { functionalStateOf } from "./overview-deliverables.ts";
import { type StatsFacts, statsOf } from "./overview-stats.ts";

const HEAD = "a".repeat(40);
const functional = functionalStateOf([undefined, undefined], HEAD);

const facts = (over: Partial<StatsFacts> = {}): StatsFacts => ({
  phase: "idea",
  audience: "team",
  fresh: false,
  maturity: { stable: 5, total: 10 },
  pendingProposals: 2,
  clientMessages: 14,
  ideaVersion: { number: 2, tag: "idea-v2", frozenAt: new Date("2026-11-05T10:00:00Z") },
  validatedDeliverables: 0,
  functional,
  hasClient: true,
  suggestions: { open: 1, first: { key: "SG-3", body: "Connexion avec Google" } },
  head: { shortSha: "a1b2c3d", indexedAt: new Date("2026-11-06T10:00:00Z"), versions: 12 },
  sprint: { key: "SP-7", done: 5, total: 8 },
  ...over,
});
const keys = (over?: Partial<StatsFacts>) => statsOf(facts(over)).map((stat) => stat.key);

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'un même comportement, un test par cas
describe("statsOf : indicateurs par phase (B275)", () => {
  it("Idée, équipe : maturité avec jauge, propositions, échanges, dernière version", () => {
    const stats = statsOf(facts());
    expect(stats.map((stat) => stat.key)).toEqual([
      "maturity",
      "proposals",
      "exchanges",
      "version",
    ]);
    expect(stats[0]).toMatchObject({
      icon: "lightbulb",
      label: "Maturité du dossier",
      value: "5 sur 10",
      gauge: { done: 5, total: 10 },
      note: "pages stables",
    });
    expect(stats[1]).toMatchObject({ value: "2", note: "de l'agent" });
    expect(stats[2]).toMatchObject({ value: "14", note: "messages du client cette semaine" });
    expect(stats[3]).toMatchObject({ value: "idea-v2", note: "figée le 5 novembre 2026" });
  });

  it("un zéro mesuré s'affiche, une source absente retire la carte (jamais de « — »)", () => {
    const stats = statsOf(facts({ pendingProposals: 0, clientMessages: 0 }));
    expect(stats.find((stat) => stat.key === "proposals")?.value).toBe("0");
    expect(stats.find((stat) => stat.key === "proposals")?.note).toBe("Aucune en attente");
    expect(stats.find((stat) => stat.key === "exchanges")?.value).toBe("0");
    expect(keys({ ideaVersion: null })).not.toContain("version");
    expect(keys({ clientMessages: null })).not.toContain("exchanges");
    for (const stat of statsOf(facts({ ideaVersion: null, clientMessages: null }))) {
      expect(stat.value).not.toMatch(/—|undefined|null/);
    }
  });

  it("projet neuf : aucun indicateur", () => {
    expect(keys({ fresh: true })).toEqual([]);
  });

  it("Idée, client : pas de vocabulaire de dépôt, version nommée pour lui", () => {
    const stats = statsOf(facts({ audience: "client" }));
    const version = stats.find((stat) => stat.key === "version");
    expect(version).toMatchObject({ label: "Dernière mise à jour", value: "Version 2" });
    expect(JSON.stringify(stats)).not.toMatch(/dépôt|idea-v|sha/i);
  });

  it("Cadrage, équipe : livrables, validations attendues, suggestions, version de la spec", () => {
    const stats = statsOf(facts({ phase: "framing" }));
    expect(stats.map((stat) => stat.key)).toEqual([
      "deliverables",
      "validations",
      "suggestions",
      "spec_version",
    ]);
    expect(stats[0]).toMatchObject({ value: "0 sur 7", gauge: { done: 0, total: 7 } });
    expect(stats[1]).toMatchObject({ value: "2", note: "fonctionnel, obligatoire" });
    expect(stats[2]).toMatchObject({ value: "1", note: "SG-3 · Connexion avec Google" });
    expect(stats[3]).toMatchObject({ value: "a1b2c3d", note: "12 versions depuis le début" });
  });

  it("Cadrage sans client : ni validations ni suggestions du client", () => {
    expect(keys({ phase: "framing", hasClient: false })).toEqual(["deliverables", "spec_version"]);
  });

  it("Cadrage, client : libellés de son point de vue, sans SHA", () => {
    const stats = statsOf(facts({ phase: "framing", audience: "client" }));
    expect(stats.map((stat) => stat.label)).toEqual([
      "Livrables validés",
      "À valider par vous",
      "Vos suggestions",
      "Dernière mise à jour",
    ]);
    expect(JSON.stringify(stats)).not.toContain("a1b2c3d");
  });

  it("suggestions à zéro : « Aucune en attente »", () => {
    const stats = statsOf(facts({ phase: "framing", suggestions: { open: 0, first: null } }));
    expect(stats.find((stat) => stat.key === "suggestions")).toMatchObject({
      value: "0",
      note: "Aucune en attente",
    });
  });

  it("Itérations : la carte Sprint seule, absente sans sprint", () => {
    const stats = statsOf(facts({ phase: "iterations" }));
    expect(stats).toEqual([
      {
        key: "sprint",
        icon: "flag",
        label: "Sprint SP-7",
        value: "5 sur 8",
        gauge: { done: 5, total: 8 },
        note: "tickets terminés",
      },
    ]);
    expect(keys({ phase: "iterations", sprint: null })).toEqual([]);
  });
});

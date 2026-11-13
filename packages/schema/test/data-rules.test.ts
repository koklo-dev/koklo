import { describe, expect, it } from "vitest";
import { checkSpec, type SpecFile } from "../src/index.ts";
import { codes, v2Files } from "./helpers.ts";

/**
 * TK-107 lot A (B386) : références R4 des tables et des jeux d'exemple, et règle 7 d'une table utilisée par un jeu.
 * Base : la spec v2 de test (F-001, F-004, R-003, T-user, T-session).
 */
const withV2 = (changes: Record<string, string | null>): SpecFile[] => {
  const byPath = new Map(v2Files().map((f) => [f.path, f.content]));
  for (const [path, content] of Object.entries(changes)) {
    if (content === null) byPath.delete(path);
    else byPath.set(path, content);
  }
  return [...byPath].map(([path, content]) => ({ path, content }));
};

const table = (extra: string, champs = "  - { nom: id, type: uuid, cle: primaire }\n") =>
  `id: T-client\nnom: Client\n${extra}champs:\n${champs}`;
const TABLE_PATH = "data/tables/client.yaml";
const FIXTURE_PATH = "data/fixtures/FX-clients.yaml";
const fixture = (lignes: string, tableId = "T-client") =>
  `id: FX-clients\ntitre: Clients\ntable: ${tableId}\nlignes:\n${lignes}`;

const errors = (files: SpecFile[]) =>
  checkSpec(files).issues.filter((issue) => issue.severity === "error");
const used = { "data/tables/session.yaml": null };

describe("R4 : références d'une table", () => {
  it("source vers F-999 : R4_UNKNOWN_FEATURE avec message", () => {
    const issues = errors(withV2({ [TABLE_PATH]: table("source: [F-999]\n") }));
    expect(codes(issues)).toEqual(["R4_UNKNOWN_FEATURE"]);
    expect(issues[0]?.message).toContain("F-999");
    expect(issues[0]?.pointer).toBe("/source/0");
  });

  it("source vers R-999 : R4_UNKNOWN_RULE", () => {
    const issues = errors(withV2({ [TABLE_PATH]: table("source: [R-999]\n") }));
    expect(codes(issues)).toEqual(["R4_UNKNOWN_RULE"]);
    expect(issues[0]?.pointer).toBe("/source/0");
  });

  it("source vers F-001 et R-003 existants : accepté", () => {
    expect(errors(withV2({ [TABLE_PATH]: table("source: [F-001, R-003]\n") }))).toEqual([]);
  });

  it("regle d'un champ vers R-999 : R4_UNKNOWN_RULE", () => {
    const champs = "  - { nom: id, type: uuid, cle: primaire, regle: R-999 }\n";
    const issues = errors(withV2({ [TABLE_PATH]: table("", champs) }));
    expect(codes(issues)).toEqual(["R4_UNKNOWN_RULE"]);
    expect(issues[0]?.pointer).toBe("/champs/0/regle");
  });

  it("ref(T-absente) : R4_UNKNOWN_TABLE", () => {
    const champs = "  - { nom: ville_id, type: ref(T-absente) }\n";
    const issues = errors(withV2({ [TABLE_PATH]: table("", champs) }));
    expect(codes(issues)).toEqual(["R4_UNKNOWN_TABLE"]);
    expect(issues[0]?.pointer).toBe("/champs/0/type");
  });

  it("ref vers une table du même lot : accepté", () => {
    const champs = "  - { nom: user_id, type: ref(T-user) }\n";
    expect(errors(withV2({ [TABLE_PATH]: table("", champs) }))).toEqual([]);
  });

  it("vers inconnue : R4_UNKNOWN_TABLE ; table du même lot : accepté", () => {
    const rel = (vers: string) => `relations:\n  - { vers: ${vers}, cardinalite: "n → 1" }\n`;
    const bad = errors(withV2({ [TABLE_PATH]: table(rel("T-absente")) }));
    expect(codes(bad)).toEqual(["R4_UNKNOWN_TABLE"]);
    expect(bad[0]?.pointer).toBe("/relations/0/vers");
    expect(errors(withV2({ [TABLE_PATH]: table(rel("T-user")) }))).toEqual([]);
  });

  it("supprimer une table visée par une relation ou un champ ref est refusé", () => {
    const issues = errors(withV2({ "data/tables/user.yaml": null }));
    expect(codes(issues)).toEqual(expect.arrayContaining(["R4_UNKNOWN_TABLE"]));
  });
});

describe("R4 : jeux d'exemple", () => {
  const files = (lignes: string, tableId?: string) =>
    withV2({
      [TABLE_PATH]: table("", "  - { nom: nom, type: texte(80) }\n"),
      [FIXTURE_PATH]: fixture(lignes, tableId),
      ...used,
    });

  it("table inconnue : R4_UNKNOWN_TABLE", () => {
    const issues = errors(files("  - { nom: Léa }\n", "T-absente"));
    expect(codes(issues)).toEqual(["R4_UNKNOWN_TABLE"]);
    expect(issues[0]?.pointer).toBe("/table");
  });

  it("clé de ligne hors champs de la table : R4_UNKNOWN_FIELD", () => {
    const issues = errors(files("  - { nom: Léa, ville: Lyon }\n"));
    expect(codes(issues)).toEqual(["R4_UNKNOWN_FIELD"]);
    expect(issues[0]?.pointer).toBe("/lignes/0/ville");
  });

  it("jeu valide : aucune erreur, et la table n'est pas orpheline (règle 7)", () => {
    const report = checkSpec(files("  - { nom: Léa }\n"));
    expect(report.counts.error).toBe(0);
    expect(codes(report.issues)).not.toContain("R7_ORPHAN_TABLE");
  });

  it("sans jeu ni référence, la même table est orpheline (R7_ORPHAN_TABLE)", () => {
    const report = checkSpec(
      withV2({ [TABLE_PATH]: table("", "  - { nom: nom, type: texte(80) }\n"), ...used }),
    );
    expect(report.issues.filter((i) => i.entityId === "T-client").map((i) => i.code)).toEqual([
      "R7_ORPHAN_TABLE",
    ]);
  });
});

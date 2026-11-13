import { describe, expect, it } from "vitest";
import { checkSpec, migrateSpecToV2, type SpecFile } from "../src/index.ts";
import { patch, withFiles } from "./helpers.ts";

const EXTRAS: Record<string, string> = {
  ".koklo/rules.yaml": "version: 1\n",
  "architecture/overview.md": "# Vue d'ensemble\n",
  "tech/cahier-technique.md": "# Cahier technique\n",
};
const v1 = (changes: Record<string, string | null> = {}): SpecFile[] =>
  withFiles({ ...EXTRAS, ...changes });

type Written = Map<string, string>;
function applied(files: SpecFile[]): { after: SpecFile[]; written: Written; deleted: string[] } {
  const result = migrateSpecToV2(files);
  expect(result.issues).toEqual([]);
  const byPath = new Map(files.map((f) => [f.path, f.content]));
  const written: Written = new Map();
  const deleted: string[] = [];
  for (const change of result.changes) {
    if ("delete" in change) {
      byPath.delete(change.path);
      deleted.push(change.path);
    } else {
      byPath.set(change.path, change.content);
      written.set(change.path, change.content);
    }
  }
  return {
    after: [...byPath].map(([path, content]) => ({ path, content })),
    written,
    deleted,
  };
}

describe("cas 8 : migration pure v1 vers v2", () => {
  it("déplace tables, endpoints, scénarios, règles de design et sections ; supprime relations.yaml", () => {
    const { written, deleted } = applied(v1());
    expect([...deleted].sort()).toEqual(
      [
        ".koklo/rules.yaml",
        "api/endpoints/E-auth-register.yaml",
        "architecture/overview.md",
        "data/relations.yaml",
        "data/tables/T-session.yaml",
        "data/tables/T-user.yaml",
        "tech/cahier-technique.md",
        "tests/scenarios/F-001-inscription.yaml",
      ].sort(),
    );
    expect([...written.keys()]).toEqual(
      expect.arrayContaining([
        "api/endpoints/auth.creer.yaml",
        "architecture/overview/01-contexte.md",
        "data/tables/session.yaml",
        "data/tables/user.yaml",
        "design/rules.yaml",
        "koklo.project.yaml",
        "quality/scenarios/F-001-inscription.yaml",
        "tech/cahier-technique/01-objet.md",
      ]),
    );
    expect(written.get("koklo.project.yaml")).toContain("spec_version: 2");
    expect(written.get("koklo.project.yaml")).toContain("projet: civinat");
    expect(written.get("design/rules.yaml")).toBe("version: 1\n");
    expect(written.get("architecture/overview/01-contexte.md")).toBe("# Vue d'ensemble\n");
  });

  it("tables : nom, types, contraintes, clé primaire, relation et ref", () => {
    const { written } = applied(v1());
    expect(written.get("data/tables/user.yaml")).toBe(
      [
        "id: T-user",
        "nom: User",
        "champs:",
        "  - nom: id",
        "    type: uuid",
        "    cle: primaire",
        "  - nom: email",
        "    type: texte(255)",
        "    contraintes: Obligatoire, unique",
        "  - nom: mot_de_passe_hash",
        "    type: texte(255)",
        "    contraintes: Obligatoire",
        "",
      ].join("\n"),
    );
    const session = written.get("data/tables/session.yaml") ?? "";
    expect(session).toContain("type: ref(T-user)");
    expect(session).toContain("relations:\n  - vers: T-user\n    cardinalite: n → 1");
  });

  it("la zone d'une table vient de la première fonctionnalité qui la cite et en porte une", () => {
    const withZone = patch(
      "features/F-001-inscription.md",
      "tables: [T-user]",
      "tables: [T-user]\nzone: Comptes",
    );
    const { written } = applied(v1({ "features/F-001-inscription.md": withZone }));
    expect(written.get("data/tables/user.yaml")).toContain("zone: Comptes");
    expect(written.get("data/tables/session.yaml")).not.toContain("zone:");
  });

  it("endpoints : zone.verbe, zone, et références réécrites partout", () => {
    const { written } = applied(v1());
    const endpoint = written.get("api/endpoints/auth.creer.yaml") ?? "";
    expect(endpoint).toContain("id: auth.creer");
    expect(endpoint).toContain("zone: auth");
    expect(endpoint).toContain("methode: POST");
    expect(written.get("features/F-001-inscription.md")).toContain("endpoints: [auth.creer]");
    expect(written.get("domain/rules/R-003-email-unique.md")).toContain("endpoints: [auth.creer]");
    expect(written.get("domain/roles.yaml")).toContain("auth.creer");
    expect(written.get("design/screens/S-register.json")).toContain('"endpoint": "auth.creer"');
    expect([...written.values()].join("\n")).not.toContain("E-auth-register");
  });

  it("le résultat est une spec v2 sans aucune erreur", () => {
    const { after } = applied(v1());
    const report = checkSpec(after);
    expect(report.issues.filter((i) => i.severity === "error")).toEqual([]);
  });

  it("collision de verbe : suffixe -2 dans l'ordre des anciens identifiants", () => {
    const second = [
      "id: E-auth-signup",
      "methode: POST",
      "chemin: /auth/signup",
      "tables: [T-user]",
      "",
    ].join("\n");
    const { written } = applied(v1({ "api/endpoints/E-auth-signup.yaml": second }));
    expect(written.has("api/endpoints/auth.creer.yaml")).toBe(true);
    expect(written.get("api/endpoints/auth.creer-2.yaml")).toContain("id: auth.creer-2");
  });

  it("GET sans accolade : lister, avec accolade : lire ; segment à accolades ignoré", () => {
    const get = (id: string, chemin: string) =>
      `id: ${id}\nmethode: GET\nchemin: ${chemin}\ntables: [T-user]\n`;
    const { written } = applied(
      v1({
        "api/endpoints/E-u-list.yaml": get("E-u-list", "/users"),
        "api/endpoints/E-u-one.yaml": get("E-u-one", "/users/{id}"),
      }),
    );
    expect(written.has("api/endpoints/users.lister.yaml")).toBe(true);
    expect(written.has("api/endpoints/users.lire.yaml")).toBe(true);
  });

  it("refuse un dépôt déjà v2", () => {
    const manifest = "projet: a\norganisation: b\nspec_version: 2\nextends: []\nrepos: []\n";
    const result = migrateSpecToV2(v1({ "koklo.project.yaml": manifest }));
    expect(result.changes).toEqual([]);
    expect(result.issues[0]?.message).toContain("déjà au format v2");
  });

  it("refuse une référence d'endpoint inconnue, sans réparation silencieuse", () => {
    const broken = patch(
      "features/F-001-inscription.md",
      "endpoints: [E-auth-register]",
      "endpoints: [E-auth-register, E-fantome]",
    );
    const result = migrateSpecToV2(v1({ "features/F-001-inscription.md": broken }));
    expect(result.changes).toEqual([]);
    expect(result.issues.length).toBeGreaterThan(0);
  });

  it("refuse si un fichier cible existe déjà", () => {
    const result = migrateSpecToV2(v1({ "design/rules.yaml": "version: 1\n" }));
    expect(result.changes).toEqual([]);
    expect(result.issues[0]?.path).toBe("design/rules.yaml");
  });

  it("n'est pas idempotente : rejouée sur son résultat, elle refuse", () => {
    const { after } = applied(v1());
    expect(migrateSpecToV2(after).issues[0]?.message).toContain("déjà au format v2");
  });
});

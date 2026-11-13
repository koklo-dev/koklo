import { describe, expect, it } from "vitest";
import type { SpecFile } from "../src/index.ts";
import {
  checkSpec,
  isTableDirPath,
  jsonSchemas,
  kindOf,
  ProjectManifestSchema,
  parseSpecFiles,
} from "../src/index.ts";
import { codes, v2Files, validFiles } from "./helpers.ts";

const MANIFEST = "koklo.project.yaml";

const withV2 = (changes: Record<string, string | null>): SpecFile[] => {
  const byPath = new Map(v2Files().map((f) => [f.path, f.content]));
  for (const [path, content] of Object.entries(changes)) {
    if (content === null) byPath.delete(path);
    else byPath.set(path, content);
  }
  return [...byPath].map(([path, content]) => ({ path, content }));
};

const ids = (files: SpecFile[]) => {
  const { spec } = parseSpecFiles(files);
  return {
    tables: spec.tables.map((t) => t.value.id),
    endpoints: spec.endpoints.map((e) => e.value.id).length,
    features: spec.features.map((f) => f.value.id),
  };
};

describe("cas 1 : v1 et v2 lus pendant la transition", () => {
  it("la spec v1 et son équivalent v2 donnent les mêmes entités, sans erreur", () => {
    expect(checkSpec(validFiles()).counts.error).toBe(0);
    expect(checkSpec(v2Files()).counts.error).toBe(0);
    expect(ids(v2Files())).toEqual(ids(validFiles()));
  });

  it("l'endpoint v2 porte l'identifiant zone.verbe", () => {
    const { spec } = parseSpecFiles(v2Files());
    expect(spec.endpoints.map((e) => e.value.id)).toEqual(["auth.creer"]);
  });
});

describe("cas 2 : spec_version 1 | 2", () => {
  it("accepte 2, refuse 3 (STRUCT_UNSUPPORTED_SPEC_VERSION)", () => {
    const base = { projet: "p", organisation: "o" };
    expect(ProjectManifestSchema.safeParse({ ...base, spec_version: 2 }).success).toBe(true);
    expect(ProjectManifestSchema.safeParse({ ...base, spec_version: 3 }).success).toBe(false);
    const content = (v2Files().find((f) => f.path === MANIFEST)?.content ?? "").replace(
      "spec_version: 2",
      "spec_version: 3",
    );
    const { issues } = parseSpecFiles([{ path: MANIFEST, content }]);
    expect(codes(issues)).toEqual(["STRUCT_UNSUPPORTED_SPEC_VERSION"]);
  });

  it("le JSON Schema du manifeste liste 1 et 2", () => {
    const props = (jsonSchemas.project as { properties: Record<string, unknown> }).properties;
    expect(props.spec_version).toMatchObject({ enum: [1, 2] });
  });

  it("l'absence de spec_version vaut 1 : une table v1 reste lue", () => {
    const files = validFiles().filter((f) => f.path !== MANIFEST);
    expect(checkSpec(files).counts.error).toBe(0);
  });
});

const TABLE_V2 = (id: string) =>
  `id: ${id}\nnom: Réservation\nchamps:\n  - { nom: id, type: uuid, cle: primaire }\n`;

describe("cas 3 : fichier de table", () => {
  it("data/tables/reservation.yaml avec T-reservation est valide en v2", () => {
    const files = withV2({ "data/tables/reservation.yaml": TABLE_V2("T-reservation") });
    expect(ids(files).tables).toContain("T-reservation");
    expect(codes(parseSpecFiles(files).issues)).toEqual([]);
  });

  it("id T-autre : STRUCT_ID_MISMATCH", () => {
    const files = withV2({ "data/tables/reservation.yaml": TABLE_V2("T-autre") });
    expect(codes(parseSpecFiles(files).issues)).toEqual(["STRUCT_ID_MISMATCH"]);
  });

  it("T-reservation.yaml (nommage v1) reste lu", () => {
    const files = withV2({ "data/tables/T-reservation.yaml": TABLE_V2("T-reservation") });
    expect(codes(parseSpecFiles(files).issues)).toEqual([]);
  });

  it("v2 : le schéma exige nom, types connus, valeurs pour un enum", () => {
    const bad = "id: T-x\nchamps:\n  - { nom: a, type: enum }\n  - { nom: b, type: varchar }\n";
    const { issues } = parseSpecFiles(withV2({ "data/tables/x.yaml": bad }));
    expect(codes(issues).every((c) => c === "STRUCT_SCHEMA_VIOLATION")).toBe(true);
    expect(issues.map((i) => i.pointer)).toEqual(
      expect.arrayContaining(["/nom", "/champs/1/type"]),
    );
    expect(issues.length).toBeGreaterThanOrEqual(3);
  });

  it("v2 : cardinalité hors liste refusée", () => {
    const content = `${TABLE_V2("T-x")}relations:\n  - { vers: T-user, cardinalite: "2 → 2" }\n`;
    const { issues } = parseSpecFiles(withV2({ "data/tables/x.yaml": content }));
    expect(codes(issues)).toEqual(["STRUCT_SCHEMA_VIOLATION"]);
  });

  it("v2 : data/relations.yaml présent -> STRUCT_UNKNOWN_FILE", () => {
    const files = withV2({ "data/relations.yaml": "relations: []\n" });
    const { issues } = parseSpecFiles(files);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ code: "STRUCT_UNKNOWN_FILE", path: "data/relations.yaml" });
  });
});

describe("cas 4 : zone et alias domaine", () => {
  const read = (files: SpecFile[]) => parseSpecFiles(files);

  it("table : domaine lu comme zone", () => {
    const content = `${TABLE_V2("T-x")}domaine: Agenda\n`;
    const { spec, issues } = read(withV2({ "data/tables/x.yaml": content }));
    expect(issues).toEqual([]);
    expect(spec.tables.find((t) => t.value.id === "T-x")?.value).toMatchObject({ zone: "Agenda" });
    expect(spec.tables.find((t) => t.value.id === "T-x")?.value).not.toHaveProperty("domaine");
  });

  it("endpoint : zone et domaine équivalents", () => {
    const path = "api/endpoints/auth.creer.yaml";
    const base = v2Files().find((f) => f.path === path)?.content ?? "";
    const viaZone = read(withV2({ [path]: base })).spec.endpoints[0]?.value;
    const viaAlias = read(withV2({ [path]: base.replace("zone: auth", "domaine: auth") })).spec
      .endpoints[0]?.value;
    expect(viaAlias).toEqual(viaZone);
    expect(viaZone).toMatchObject({ zone: "auth" });
  });

  it("fonctionnalité : domaine lu comme zone", () => {
    const path = "features/F-001-inscription.md";
    const base = v2Files().find((f) => f.path === path)?.content ?? "";
    const { spec, issues } = read(
      withV2({ [path]: base.replace("zone: Comptes", "domaine: Comptes") }),
    );
    expect(issues).toEqual([]);
    expect(spec.features[0]?.value.zone).toBe("Comptes");
  });

  it("les deux présents et différents : STRUCT_SCHEMA_VIOLATION", () => {
    const content = `${TABLE_V2("T-x")}zone: A\ndomaine: B\n`;
    const { issues } = read(withV2({ "data/tables/x.yaml": content }));
    expect(codes(issues)).toEqual(["STRUCT_SCHEMA_VIOLATION"]);
    const same = read(withV2({ "data/tables/x.yaml": `${TABLE_V2("T-x")}zone: A\ndomaine: A\n` }));
    expect(same.issues).toEqual([]);
  });
});

describe("cas 5 : fichier de table hors format", () => {
  it("notes.txt et T-.yaml : STRUCT_UNKNOWN_TABLE_FILE avec le chemin", () => {
    const files = withV2({ "data/tables/notes.txt": "x", "data/tables/T-.yaml": "id: T-" });
    const { issues } = parseSpecFiles(files);
    expect(codes(issues)).toEqual(["STRUCT_UNKNOWN_TABLE_FILE", "STRUCT_UNKNOWN_TABLE_FILE"]);
    expect(issues.map((i) => i.path).sort()).toEqual([
      "data/tables/T-.yaml",
      "data/tables/notes.txt",
    ]);
    expect(issues[0]?.message).toContain("data/tables/");
  });

  it(".gitkeep toléré", () => {
    expect(parseSpecFiles(withV2({ "data/tables/.gitkeep": "" })).issues).toEqual([]);
  });

  it("isTableDirPath et kindOf", () => {
    expect(isTableDirPath("data/tables/notes.txt")).toBe(true);
    expect(isTableDirPath("data/tables/.gitkeep")).toBe(false);
    expect(isTableDirPath("data/other.txt")).toBe(false);
    expect(kindOf("data/tables/reservation.yaml")).toBe("table");
    expect(kindOf("data/tables/T-x.yaml")).toBe("table");
    expect(kindOf("data/tables/notes.txt")).toBeUndefined();
    expect(kindOf("data/tables/T-.yaml")).toBeUndefined();
    expect(kindOf("api/endpoints/reservation.lister.yaml")).toBe("endpoint");
    expect(kindOf("api/endpoints/E-x.yaml")).toBe("endpoint");
    expect(kindOf("quality/scenarios/F-001-inscription.yaml")).toBe("test");
    expect(kindOf("tests/scenarios/F-001-inscription.yaml")).toBe("test");
  });
});

describe("cas 6 : règles 4 et 7 sans relations.yaml", () => {
  it("relations[].vers inconnu : R4_UNKNOWN_TABLE", () => {
    const content = `${TABLE_V2("T-x")}relations:\n  - { vers: T-fantome, cardinalite: "1 → n" }\n`;
    const report = checkSpec(withV2({ "data/tables/x.yaml": content }));
    const r4 = report.issues.filter((i) => i.code === "R4_UNKNOWN_TABLE");
    expect(r4).toHaveLength(1);
    expect(r4[0]).toMatchObject({ path: "data/tables/x.yaml", pointer: "/relations/0/vers" });
  });

  it("table citée seulement par une relation : pas orpheline (R7)", () => {
    const only = "id: T-cible\nnom: Cible\nchamps:\n  - { nom: id, type: uuid, cle: primaire }\n";
    const source = `${TABLE_V2("T-source")}relations:\n  - { vers: T-cible, cardinalite: "1 → n" }\n`;
    const orphans = (files: SpecFile[]) =>
      checkSpec(files)
        .issues.filter((i) => i.code === "R7_ORPHAN_TABLE")
        .map((i) => i.entityId)
        .filter((id) => id === "T-source" || id === "T-cible");
    const base = { "data/tables/cible.yaml": only, "data/tables/source.yaml": source };
    expect(orphans(withV2(base))).toEqual(["T-source"]);
    expect(orphans(withV2({ "data/tables/cible.yaml": only }))).toEqual(["T-cible"]);
  });

  it("v1 inchangé : relations.yaml vers une table inconnue", () => {
    const files = validFiles().map((f) =>
      f.path === "data/relations.yaml"
        ? { ...f, content: f.content.replace("T-user.id", "T-nope.id") }
        : f,
    );
    expect(codes(checkSpec(files).issues)).toContain("R4_UNKNOWN_TABLE");
  });
});

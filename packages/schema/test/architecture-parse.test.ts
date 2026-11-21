import { describe, expect, it } from "vitest";
import { checkSpec, kindOf, parseSpecFiles } from "../src/index.ts";
import { ADR_MD, archFiles, componentYaml, FLOW_YAML } from "./architecture-helpers.ts";
import { codes } from "./helpers.ts";

/** TK-111 lot A : `kindOf`, parse et indexation des trois nouveaux genres (cas 1). */
describe("kindOf architecture", () => {
  it("reconnaît component, archflow et adr ; le reste du dossier est ignoré", () => {
    expect(kindOf("architecture/components/api.yaml")).toBe("component");
    expect(kindOf("architecture/components/C-api.yaml")).toBe("component");
    expect(kindOf("architecture/flows/P-inscription.yaml")).toBe("archflow");
    expect(kindOf("architecture/adr/ADR-001-base.md")).toBe("adr");
    expect(kindOf("design/flows/P-inscription.yaml")).toBe("flow");
    for (const ignored of [
      "architecture/schema.mmd",
      "architecture/flows/P-inscription.mmd",
      "architecture/components/.gitkeep",
      "architecture/adr/.gitkeep",
      "architecture/overview/01-contexte.md",
      "architecture/flows/autre.yaml",
      "architecture/adr/note.md",
    ]) {
      expect(kindOf(ignored), ignored).toBeUndefined();
    }
  });
});

describe("parseSpecFiles : architecture", () => {
  const files = archFiles({
    "architecture/components/api.yaml": componentYaml("C-api", "possede: [T-user]\n"),
    "architecture/components/db.yaml": componentYaml("C-db"),
    "architecture/flows/P-inscription.yaml": FLOW_YAML,
    "architecture/adr/ADR-001-base.md": ADR_MD,
  });

  it("range composants, flux techniques et décisions dans le snapshot", () => {
    const { spec, issues } = parseSpecFiles(files);
    expect(issues).toEqual([]);
    expect(spec.components.map((c) => c.value.id)).toEqual(["C-api", "C-db"]);
    expect(spec.archFlows.map((f) => f.value.id)).toEqual(["P-inscription"]);
    expect(spec.adrs.map((a) => a.value.id)).toEqual(["ADR-001"]);
    expect(spec.flows).toEqual([]);
  });

  it("le slug seul suffit comme nom de fichier : C-api ↔ api.yaml", () => {
    const { issues } = parseSpecFiles(
      archFiles({ "architecture/components/api.yaml": componentYaml("C-api") }),
    );
    expect(issues).toEqual([]);
  });

  it("identifiant différent du nom de fichier : STRUCT_ID_MISMATCH, entité exclue", () => {
    const { spec, issues } = parseSpecFiles(
      archFiles({ "architecture/components/web.yaml": componentYaml("C-api") }),
    );
    expect(codes(issues)).toEqual(["STRUCT_ID_MISMATCH"]);
    expect(spec.components).toEqual([]);
  });

  it("doublon d'identifiant (C-api.yaml et api.yaml) : STRUCT_DUPLICATE_ID", () => {
    const { spec, issues } = parseSpecFiles(
      archFiles({
        "architecture/components/api.yaml": componentYaml("C-api"),
        "architecture/components/C-api.yaml": componentYaml("C-api"),
      }),
    );
    expect(codes(issues)).toEqual(["STRUCT_DUPLICATE_ID"]);
    expect(spec.components).toHaveLength(1);
  });

  it("schéma violé : type hors liste signalé avec pointeur, composant exclu", () => {
    const { spec, issues } = parseSpecFiles(
      archFiles({
        "architecture/components/api.yaml": componentYaml("C-api").replace("service", "lambda"),
      }),
    );
    expect(codes(issues)).toEqual(["STRUCT_SCHEMA_VIOLATION"]);
    expect(issues[0]?.pointer).toBe("/type");
    expect(spec.components).toEqual([]);
  });

  it("un flux technique et un parcours de même P-id coexistent sans doublon", () => {
    const withBoth = archFiles({
      "design/flows/P-inscription.yaml":
        "id: P-inscription\ntitre: Inscription\nacteur: Visiteur\ndepart: { libelle: Ouvre }\n",
      "architecture/components/api.yaml": componentYaml("C-api"),
      "architecture/components/db.yaml": componentYaml("C-db"),
      "architecture/flows/P-inscription.yaml": FLOW_YAML,
    });
    expect(parseSpecFiles(withBoth).issues).toEqual([]);
  });

  it("fichiers tolérants : _zones.yaml, actors.yaml et .mmd ne produisent aucune issue", () => {
    const tolerated = archFiles({
      "architecture/_zones.yaml": "zones: [{ nom: Noyau }]\n",
      "architecture/actors.yaml": "acteurs: []\n",
      "architecture/schema.mmd": "flowchart LR\n",
    });
    expect(checkSpec(tolerated).issues.filter((i) => i.rule === "structure")).toEqual([]);
  });
});

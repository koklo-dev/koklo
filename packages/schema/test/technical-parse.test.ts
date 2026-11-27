import { describe, expect, it } from "vitest";
import { kindOf, parseSpecFiles } from "../src/index.ts";
import { codes } from "./helpers.ts";
import {
  ENVIRONMENTS_PATH,
  NFR_PATH,
  NFR_YAML,
  OPERATION_PATH,
  OPERATION_YAML,
  STACK_PATH,
  STACK_YAML,
  techFiles,
} from "./technical-helpers.ts";

/** TK-115 lot A (cas 1) : lecture des fichiers du cahier technique ; l'ancien REST reste lu. */
const issuesOf = (changes: Record<string, string | null>) =>
  parseSpecFiles(techFiles(changes)).issues;

describe("genres de fichiers", () => {
  it("stack, endpoint, nfr, environnements ; le cahier rédigé n'est pas indexé", () => {
    expect(kindOf(STACK_PATH)).toBe("stack");
    expect(kindOf(OPERATION_PATH)).toBe("endpoint");
    expect(kindOf("api/endpoints/liste_attente.list.yaml")).toBe("endpoint");
    expect(kindOf(NFR_PATH)).toBe("nfr");
    expect(kindOf(ENVIRONMENTS_PATH)).toBe("environments");
    expect(kindOf("tech/cahier-technique/01-objet.md")).toBeUndefined();
    expect(kindOf("tech/stack/.gitkeep")).toBeUndefined();
    expect(kindOf("nfr/notes.yaml")).toBeUndefined();
  });
});

describe("lecture du cahier technique", () => {
  it("range chaque entité dans sa liste ; l'opération n'entre pas dans les endpoints REST", () => {
    const { spec, issues } = parseSpecFiles(techFiles());
    expect(issues).toEqual([]);
    expect(spec.stacks.map((s) => s.value.id)).toEqual(["ST-sms"]);
    expect(spec.operations.map((o) => o.value.id)).toEqual(["creneau.listAvailable"]);
    expect(spec.endpoints.map((e) => e.value.id)).toEqual(["auth.creer"]);
    expect(spec.endpoints[0]?.value.methode).toBe("POST");
    expect(spec.nfrs.map((n) => n.value.id)).toEqual(["NFR-001"]);
    expect(spec.environments[0]?.value.variables[0]?.nom).toBe("DATABASE_URL");
  });

  it("l'alias domaine reste lu sur une opération", () => {
    const content = OPERATION_YAML.replace("zone:", "domaine:");
    const { spec } = parseSpecFiles(techFiles({ [OPERATION_PATH]: content }));
    expect(spec.operations[0]?.value.zone).toBe("Prise de rendez-vous");
  });

  it("clé inconnue refusée, entité exclue", () => {
    const { spec, issues } = parseSpecFiles(
      techFiles({ [STACK_PATH]: `${STACK_YAML}pour: [C-api]\n` }),
    );
    expect(codes(issues)).toEqual(["STRUCT_SCHEMA_VIOLATION"]);
    expect(issues[0]).toMatchObject({ path: STACK_PATH, entityId: "ST-sms" });
    expect(spec.stacks).toEqual([]);
  });

  it("une valeur de variable est refusée à la lecture", () => {
    const content = "variables:\n  - { nom: AUTH_SECRET, usage: Sessions, valeur: x }\n";
    expect(codes(issuesOf({ [ENVIRONMENTS_PATH]: content }))).toEqual(["STRUCT_SCHEMA_VIOLATION"]);
  });

  it("identifiant en désaccord avec le fichier : ST- (slug seul), NFR- et opération", () => {
    expect(codes(issuesOf({ "tech/stack/autre.yaml": STACK_YAML, [STACK_PATH]: null }))).toEqual([
      "STRUCT_ID_MISMATCH",
    ]);
    expect(codes(issuesOf({ "nfr/NFR-002.yaml": NFR_YAML, [NFR_PATH]: null }))).toEqual([
      "STRUCT_ID_MISMATCH",
    ]);
    expect(
      codes(
        issuesOf({ "api/endpoints/creneau.autre.yaml": OPERATION_YAML, [OPERATION_PATH]: null }),
      ),
    ).toEqual(["STRUCT_ID_MISMATCH"]);
  });

  it("doublon d'exigence signalé, la première est gardée", () => {
    const issues = issuesOf({ "nfr/NFR-001-copie.yaml": NFR_YAML });
    expect(codes(issues)).toEqual(["STRUCT_DUPLICATE_ID"]);
  });
});

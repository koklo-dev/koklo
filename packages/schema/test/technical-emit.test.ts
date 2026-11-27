import { describe, expect, it } from "vitest";
import {
  EmitEnvironmentsError,
  EmitNfrError,
  EmitOperationError,
  EmitStackError,
  type EnvironmentsFileInput,
  emitEnvironmentsYaml,
  emitNfrYaml,
  emitOperationYaml,
  emitStackYaml,
  parseSpecFiles,
} from "../src/index.ts";
import {
  ENVIRONMENTS_PATH,
  NFR_PATH,
  OPERATION_PATH,
  STACK_PATH,
  techFiles,
} from "./technical-helpers.ts";

/** TK-115 lot A (cas 1) : émetteurs déterministes ; émettre puis relire rend la même entité. */
const { spec } = parseSpecFiles(techFiles());
const stack = spec.stacks[0]?.value;
const operation = spec.operations[0]?.value;
const nfr = spec.nfrs[0]?.value;
const environments = spec.environments[0]?.value;
if (!stack || !operation || !nfr || !environments) throw new Error("spec technique illisible");

const reread = (path: string, content: string) => parseSpecFiles(techFiles({ [path]: content }));
const reversed = <T extends object>(value: T): T =>
  Object.fromEntries(Object.entries(value).reverse()) as T;
const keys = (yaml: string) =>
  yaml.split("\n").flatMap((line) => /^([a-z_]+):/.exec(line)?.[1] ?? []);

const CASES = [
  ["choix", STACK_PATH, () => emitStackYaml(stack), () => emitStackYaml(reversed(stack)), "stacks"],
  [
    "opération",
    OPERATION_PATH,
    () => emitOperationYaml(operation),
    () => emitOperationYaml(reversed(operation)),
    "operations",
  ],
  ["exigence", NFR_PATH, () => emitNfrYaml(nfr), () => emitNfrYaml(reversed(nfr)), "nfrs"],
  [
    "environnements",
    ENVIRONMENTS_PATH,
    () => emitEnvironmentsYaml(environments),
    () => emitEnvironmentsYaml(reversed(environments)),
    "environments",
  ],
] as const;

describe("émission puis relecture", () => {
  it.each(CASES)("%s : même entité, sans issue, idempotente", (_name, path, emit, _other, list) => {
    const content = emit();
    const read = reread(path, content);
    expect(read.issues).toEqual([]);
    expect(read.spec[list][0]?.value).toEqual(spec[list][0]?.value);
    expect(content.endsWith("\n")).toBe(true);
    expect(emit()).toBe(content);
  });

  it.each(CASES)("%s : l'ordre des clés ne dépend pas de l'entrée", (_n, _p, emit, other) => {
    expect(other()).toBe(emit());
  });
});

describe("forme canonique", () => {
  it("ordre fixe des clés", () => {
    expect(keys(emitStackYaml(stack))).toEqual([
      "id",
      "couche",
      "icone",
      "role",
      "statut",
      "recommande",
      "composants",
      "options",
      "criteres",
      "pourquoi",
      "en_clair",
      "exigences",
      "decisions",
    ]);
    expect(keys(emitOperationYaml(operation))).toEqual([
      "id",
      "type",
      "zone",
      "composant",
      "permission",
      "resume",
      "entree",
      "sortie",
      "erreurs",
      "regles",
      "sert",
      "limite",
    ]);
    expect(keys(emitNfrYaml(nfr))).toEqual([
      "id",
      "categorie",
      "titre",
      "cible",
      "enonce",
      "verification",
      "liens",
    ]);
  });

  it("listes et objets vides omis", () => {
    const text = emitOperationYaml({
      id: "avis.create",
      type: "ecriture",
      zone: "Avis",
      composant: "C-api",
      permission: "interne",
      resume: "Crée un avis.",
    });
    expect(keys(text)).toEqual(["id", "type", "zone", "composant", "permission", "resume"]);
    expect(emitEnvironmentsYaml({})).toBe("{}\n");
  });

  it("une valeur douteuse reste un texte à la relecture", () => {
    const content = emitStackYaml({ ...stack, options: ["Brevo", "null"], recommande: "null" });
    expect(reread(STACK_PATH, content).spec.stacks[0]?.value.options).toEqual(["Brevo", "null"]);
  });
});

describe("valeurs refusées", () => {
  it("chaque émetteur lève sa propre erreur avec le pointeur", () => {
    expect(() => emitStackYaml({ ...stack, options: [] })).toThrow(EmitStackError);
    expect(() => emitOperationYaml({ ...operation, id: "E-x" })).toThrow(EmitOperationError);
    expect(() => emitNfrYaml({ ...nfr, cible: "" })).toThrow(EmitNfrError);
    expect(() => emitNfrYaml({ ...nfr, cible: "" })).toThrow("/cible");
    const leak = { variables: [{ nom: "A", usage: "u", valeur: "x" }] };
    expect(() => emitEnvironmentsYaml(leak as EnvironmentsFileInput)).toThrow(
      EmitEnvironmentsError,
    );
  });
});

import { describe, expect, it } from "vitest";
import { buildInitialSpecFiles } from "../src/repo/spec-scaffold.ts";

/**
 * TK-43 CA2 : générateur pur de la structure initiale (annexe A §4.0). Contrat attendu :
 * `buildInitialSpecFiles({ projectName, organizationSlug, projectSlug }): FileChange[]`
 * (`{ path, content }`), déterministe, sans exemple nominatif de l'annexe.
 */
const INPUT = {
  projectName: "Civinat",
  organizationSlug: "atelier-lumiere",
  projectSlug: "civinat",
};

const MARKERS = [
  "koklo.project.yaml",
  "README.md",
  "brief/0001-idee-initiale.md",
  "architecture/overview.md",
  "tech/cahier-technique.md",
  "domain/roles.yaml",
  "data/relations.yaml",
  ".koklo/rules.yaml",
];
const KEPT_DIRECTORIES = [
  "features",
  "architecture/adr",
  "data/tables",
  "domain/rules",
  "nfr",
  "api/endpoints",
  "design/tokens",
  "design/components",
  "design/screens",
  "design/flows",
  "design/fixtures",
  "design/assets",
  "tests/scenarios",
];

describe("buildInitialSpecFiles : contenu", () => {
  const files = buildInitialSpecFiles(INPUT);
  const paths = files.map((file) => file.path);

  it("pose les fichiers du squelette de l'annexe A §4.0", () => {
    for (const marker of MARKERS) expect(paths, marker).toContain(marker);
  });

  it("garde les dossiers vides avec un .gitkeep", () => {
    for (const directory of KEPT_DIRECTORIES) {
      expect(paths, directory).toContain(`${directory}/.gitkeep`);
    }
  });

  it("n'a aucun doublon, que des chemins relatifs sans .., et des contenus texte", () => {
    expect(new Set(paths).size).toBe(paths.length);
    for (const file of files) {
      expect(file.path).not.toMatch(/^\/|(^|\/)\.\.(\/|$)|\\/);
      expect(typeof file.content).toBe("string");
    }
  });

  it("n'embarque aucune entité d'exemple (F-001, T-user, S-register…) qui polluerait l'index", () => {
    for (const file of files) {
      expect(file.path).not.toMatch(/(^|\/)(F|T|R|E|S|C|FX|P)-[A-Za-z0-9-]+\.[a-z]+$/);
    }
  });

  it("le README remplace celui de l'auto-init et nomme le projet géré par Koklo", () => {
    const readme = files.find((file) => file.path === "README.md")?.content ?? "";
    expect(readme).toContain("Civinat");
    expect(readme).toMatch(/Koklo/);
  });

  it("est déterministe : deux appels, mêmes fichiers dans le même ordre", () => {
    expect(buildInitialSpecFiles(INPUT)).toEqual(files);
  });
});

describe("buildInitialSpecFiles : validité (@koklo/schema)", () => {
  it("le manifeste porte projet, organisation et spec_version 1, et checkSpec ne rend aucune erreur", async () => {
    const { checkSpec, parseSpecFiles } = await import("@koklo/schema");
    const files = buildInitialSpecFiles(INPUT);
    const manifest = parseSpecFiles(files).spec.project?.value;
    expect(manifest).toMatchObject({
      projet: "civinat",
      organisation: "atelier-lumiere",
      spec_version: 1,
      extends: [],
      repos: [],
    });
    const report = checkSpec(files);
    expect(report.issues.filter((issue) => issue.severity === "error")).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.counts.error).toBe(0);
  });

  it("reste valide pour un nom de projet à caractères spéciaux (le slug fait foi pour le manifeste)", async () => {
    const { checkSpec } = await import("@koklo/schema");
    const files = buildInitialSpecFiles({
      projectName: 'Café "Été" : n°1 & co',
      organizationSlug: "org-2",
      projectSlug: "cafe-ete-n-1-co",
    });
    expect(checkSpec(files).ok).toBe(true);
  });
});

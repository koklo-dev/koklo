import type { FileChange } from "@koklo/domain";

export interface SpecScaffoldInput {
  projectName: string;
  organizationSlug: string;
  projectSlug: string;
}

/** Dossiers de l'arbre de spec (annexe A §4.0) qui n'ont aucun fichier au départ : Git ignore les dossiers vides. */
const EMPTY_DIRECTORIES = [
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
] as const;

/** Chaîne YAML entre guillemets : un slug comme `null` ou `123` ne devient pas un autre type. */
const quoted = (value: string): string => JSON.stringify(value);

const readme = (name: string): string =>
  `# ${name}

Dépôt de spécification géré par Koklo : ne l'éditez pas à la main, les modifications passent par
Koklo (lots d'écriture sur la branche \`cadrage\`).

- \`brief/\` : l'idée de départ et les décisions de cadrage.
- \`features/\`, \`data/\`, \`api/\`, \`design/\`, \`tests/\` : le modèle de spec validé par Koklo.
`;

const brief = (name: string): string =>
  `# Idée initiale : ${name}

À compléter pendant le cadrage : problème, utilisateurs, résultat attendu.
`;

const OVERVIEW = `# Architecture

À compléter pendant le cadrage : contexte, composants principaux, dépendances externes.
`;

const TECH = `# Cahier technique

À compléter pendant le cadrage : pile retenue, contraintes, environnements.
`;

/**
 * Structure initiale du dépôt de spec, posée en un seul commit : manifeste, squelettes et un
 * `.gitkeep` par dossier vide. Aucune entité d'exemple (elle polluerait l'index et les règles de
 * cohérence). Pure et déterministe : mêmes entrées, mêmes fichiers dans le même ordre.
 */
export function buildInitialSpecFiles(input: SpecScaffoldInput): FileChange[] {
  const name = input.projectName.trim();
  return [
    {
      path: "koklo.project.yaml",
      content: `projet: ${quoted(input.projectSlug)}
organisation: ${quoted(input.organizationSlug)}
spec_version: 1
extends: []
repos: []
`,
    },
    { path: "README.md", content: readme(name) },
    { path: "brief/0001-idee-initiale.md", content: brief(name) },
    { path: "architecture/overview.md", content: OVERVIEW },
    { path: "tech/cahier-technique.md", content: TECH },
    { path: "domain/roles.yaml", content: "roles: []\n" },
    { path: "data/relations.yaml", content: "relations: []\n" },
    { path: ".koklo/rules.yaml", content: "version: 1\n" },
    ...EMPTY_DIRECTORIES.map((directory) => ({ path: `${directory}/.gitkeep`, content: "" })),
  ];
}

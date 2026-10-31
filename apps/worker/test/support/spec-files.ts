import type { Scene } from "./spec-write-bench.ts";

/** Fabriques de fichiers de spec (format TK-40) pour les tests de l'indexeur de TK-45b. */
export interface FeatureOptions {
  status?: string;
  priority?: string;
  criteria?: readonly string[];
  tables?: readonly string[];
  endpoints?: readonly string[];
}

const list = (items: readonly string[] | undefined) => `[${(items ?? []).join(", ")}]`;

/** Feature Markdown : un critère `AC-n — titre` par entrée de `criteria` (une étape de chaque type). */
export function featureMd(id: string, title: string, options: FeatureOptions = {}): string {
  const criteria = (options.criteria ?? []).map(
    (name, index) =>
      `### AC-${index + 1} — ${name}\n- **Étant donné** un contexte\n- **Quand** une action\n- **Alors** un résultat\n`,
  );
  return [
    "---",
    `id: ${id}`,
    `titre: ${title}`,
    `statut: ${options.status ?? "specifiee"}`,
    `priorite: ${options.priority ?? "must"}`,
    `tables: ${list(options.tables)}`,
    `endpoints: ${list(options.endpoints)}`,
    "---",
    "",
    "## Description",
    `Description de ${title}.`,
    "",
    "## Critères d'acceptation",
    "",
    ...criteria,
  ].join("\n");
}

export const tableYaml = (id: string): string =>
  `id: ${id}\nchamps:\n  - { nom: id, type: uuid, nullable: false, unique: true }\n`;

export const endpointYaml = (id: string, method: string, path: string): string =>
  `id: ${id}\nmethode: ${method}\nchemin: ${path}\n`;

export const featurePath = (id: string, slug = "x"): string => `features/${id}-${slug}.md`;

/** Préfixe les chemins par le dossier de la spec d'un monorepo, s'il y en a un. */
export function underSpecPath(
  scene: Pick<Scene, "repoId"> & { specPath?: string | null },
  files: Record<string, string>,
): Record<string, string> {
  const prefix = scene.specPath ? `${scene.specPath}/` : "";
  return Object.fromEntries(
    Object.entries(files).map(([path, content]) => [prefix + path, content]),
  );
}

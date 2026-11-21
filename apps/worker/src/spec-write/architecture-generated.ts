import { type Component, emitFlowMermaid, emitSchemaMermaid, parseSpecFiles } from "@koklo/schema";
import { archFlowMermaidPathOf } from "./archflows.ts";
import { removeFile, type Workspace, writeFile } from "./workspace.ts";

export const SCHEMA_MERMAID_PATH = "architecture/schema.mmd";
const FLOW_MERMAID = /^architecture\/flows\/(P-[a-z0-9][a-z0-9-]*)\.mmd$/;
const isRemoved = (workspace: Workspace, path: string): boolean => {
  const change = workspace.changes.get(path);
  return change !== undefined && "delete" in change;
};
const isComponentPath = (path: string): boolean => path.startsWith("architecture/components/");
const touchesArchitecture = (path: string): boolean =>
  isComponentPath(path) || (path.startsWith("architecture/flows/") && path.endsWith(".yaml"));

/** Écrit un fichier généré seulement s'il diffère de ce que le lot connaît (un `.mmd` non lu est toujours écrit). */
function writeGenerated(workspace: Workspace, path: string, content: string): void {
  if (workspace.files.get(path) !== content) writeFile(workspace, path, content);
}

/** Noms lisibles des participants d'un flux : composants puis rôles (acteurs). */
function labelsOf(
  components: readonly Component[],
  roles: readonly { id: string; nom: string }[],
): Record<string, string> {
  return Object.fromEntries([
    ...roles.map((role) => [role.id, role.nom] as const),
    ...components.map((component) => [component.id, component.nom] as const),
  ]);
}

/**
 * `architecture/schema.mmd` et `architecture/flows/<P-id>.mmd` sont générés, jamais édités (B507) : quand un composant ou un
 * flux change, ils sont réécrits dans le même lot (donc le même commit) depuis l'état final. Le schéma disparaît avec le
 * dernier composant ; un `.mmd` dont le `.yaml` a disparu est supprimé. `tree` : chemins de la tête (fichiers non lus compris).
 */
export function refreshArchitecture(workspace: Workspace, tree: Iterable<string>): void {
  if (![...workspace.changes.keys()].some(touchesArchitecture)) return;
  const { spec } = parseSpecFiles(
    [...workspace.files].map(([path, content]) => ({ path, content })),
  );
  const components = spec.components.map((entry) => entry.value);
  const known = new Set([...tree, ...workspace.files.keys()]);
  const componentsChanged = [...workspace.changes.keys()].some(isComponentPath);
  if (!componentsChanged) {
    // Le schéma ne dépend que des composants : un lot de flux seul ne le touche pas.
  } else if (components.length > 0) {
    writeGenerated(workspace, SCHEMA_MERMAID_PATH, emitSchemaMermaid(components));
  } else if (known.has(SCHEMA_MERMAID_PATH)) {
    removeFile(workspace, SCHEMA_MERMAID_PATH);
  }
  const roles = spec.roles.flatMap((file) => file.value.roles);
  const labels = labelsOf(components, roles);
  const flows = new Set(spec.archFlows.map((entry) => entry.value.id));
  for (const { value } of spec.archFlows) {
    writeGenerated(workspace, archFlowMermaidPathOf(value.id), emitFlowMermaid(value, labels));
  }
  for (const path of known) {
    const id = FLOW_MERMAID.exec(path)?.[1];
    if (id !== undefined && !flows.has(id) && !isRemoved(workspace, path)) {
      removeFile(workspace, path);
    }
  }
}

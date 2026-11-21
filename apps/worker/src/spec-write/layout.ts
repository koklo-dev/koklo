import {
  ARCH_LAYOUT_PATH,
  type ArchLayoutPositions,
  EmitArchLayoutError,
  EmitLayoutError,
  emitArchLayoutYaml,
  emitLayoutYaml,
  LAYOUT_PATH,
  type LayoutPositions,
} from "@koklo/schema";
import type { BatchOperation } from "./types.ts";
import { forbidDesigner, invalidEmit, type Workspace, writeFile } from "./workspace.ts";

/** `layout.save` : le client écrit tout le plan à chaque dépôt (contrat 3.6.0, B418). */
export const LAYOUT_KIND = "layout.save";
/** `architecture.layout.save` : même principe pour le schéma d'architecture (contrat 3.10.0, B542). */
export const ARCH_LAYOUT_KIND = "architecture.layout.save";

/** Tous les genres de mise en page : aucun élément visé, aucun conflit (le dernier écrit gagne). */
export const isLayoutKind = (kind: string): boolean =>
  kind === LAYOUT_KIND || kind === ARCH_LAYOUT_KIND;

interface LayoutFile {
  path: string;
  emit: (positions: unknown) => string;
  isEmitError: (error: unknown) => error is { message: string; path: string };
}

const DATA_FILE: LayoutFile = {
  path: LAYOUT_PATH,
  emit: (positions) => emitLayoutYaml(positions as LayoutPositions),
  isEmitError: (error): error is EmitLayoutError => error instanceof EmitLayoutError,
};
const ARCHITECTURE_FILE: LayoutFile = {
  path: ARCH_LAYOUT_PATH,
  emit: (positions) => emitArchLayoutYaml(positions as ArchLayoutPositions),
  isEmitError: (error): error is EmitArchLayoutError => error instanceof EmitArchLayoutError,
};

/**
 * Réécrit le fichier de mise en page (trié par identifiant) : ni jeu, ni table, ni composant, donc aucun fichier dérivé
 * (`data/model.mmd`, schéma Mermaid) n'est régénéré. Le designer le lit mais ne l'écrit pas (B417). Une position hors bornes
 * est refusée par l'émission (`SPEC_INVALID`). Le genre de l'opération choisit le fichier.
 */
export function applyLayout(workspace: Workspace, operation: BatchOperation): void {
  forbidDesigner(workspace);
  const file = operation.kind === ARCH_LAYOUT_KIND ? ARCHITECTURE_FILE : DATA_FILE;
  try {
    writeFile(workspace, file.path, file.emit(operation.payload.positions));
  } catch (error) {
    if (!file.isEmitError(error)) throw error;
    invalidEmit(file.path, "layout", error);
  }
}

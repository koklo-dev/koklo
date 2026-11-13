import { EmitLayoutError, emitLayoutYaml, LAYOUT_PATH, type LayoutPositions } from "@koklo/schema";
import type { BatchOperation } from "./types.ts";
import { forbidDesigner, invalidEmit, type Workspace, writeFile } from "./workspace.ts";

/** `layout.save` : le client écrit tout le plan à chaque dépôt (contrat 3.6.0, B418). */
export const LAYOUT_KIND = "layout.save";

/**
 * `layout.save` réécrit `data/_layout.yaml` (trié par identifiant) : ni jeu, ni table, donc `data/model.mmd` reste intact.
 * Le designer le lit mais ne l'écrit pas (B417). Une position hors bornes est refusée par l'émission (`SPEC_INVALID`).
 */
export function applyLayout(workspace: Workspace, operation: BatchOperation): void {
  forbidDesigner(workspace);
  const positions = operation.payload.positions as LayoutPositions;
  try {
    writeFile(workspace, LAYOUT_PATH, emitLayoutYaml(positions));
  } catch (error) {
    if (!(error instanceof EmitLayoutError)) throw error;
    invalidEmit(LAYOUT_PATH, "layout", error);
  }
}

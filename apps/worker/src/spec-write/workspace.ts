import type { FileChange } from "@koklo/domain";
import type { Issue } from "@koklo/schema";
import { toStoredReport } from "./report.ts";
import { failed, type Outcome } from "./types.ts";

/** Arrêt du calcul avec un résultat métier (conflit, interdit, spec invalide). */
export class PlanStop extends Error {
  readonly outcome: Outcome;
  constructor(outcome: Outcome) {
    super("plan stopped");
    this.outcome = outcome;
  }
}

export function stop(outcome: Outcome): never {
  throw new PlanStop(outcome);
}

/** Espace de travail du plan : l'état lu de la spec (chemin -> contenu) et les changements accumulés. */
export interface Workspace {
  readonly designer: boolean;
  readonly files: Map<string, string>;
  readonly changes: Map<string, FileChange>;
}

export function writeFile(workspace: Workspace, path: string, content: string): void {
  workspace.files.set(path, content);
  workspace.changes.set(path, { path, content });
}

export function removeFile(workspace: Workspace, path: string): void {
  workspace.files.delete(path);
  workspace.changes.set(path, { path, delete: true });
}

/** Diagnostic d'une valeur refusée à l'émission (`EmitFeatureError`, `EmitRuleError`...) : le lot est `SPEC_INVALID`. */
export function invalidEmit(
  path: string,
  id: string,
  error: { message: string; path: string },
): never {
  const issue: Issue = {
    rule: "structure",
    code: "STRUCT_SCHEMA_VIOLATION",
    severity: "error",
    path,
    pointer: error.path,
    entityId: id,
    message: error.message,
  };
  return stop(failed("SPEC_INVALID", toStoredReport([issue])));
}

/** Le designer ne touche ni aux règles ni aux rôles (B340, vision §14). */
export function forbidDesigner(workspace: Workspace): void {
  if (workspace.designer) stop(failed("FORBIDDEN"));
}

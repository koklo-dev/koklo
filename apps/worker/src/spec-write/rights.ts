import { emitRightsYaml, type RightRestriction, type RightsFile } from "@koklo/schema";
import { readEntity, writeEntity } from "./technical-files.ts";
import type { BatchOperation } from "./types.ts";
import { forbidDesigner, type Workspace } from "./workspace.ts";

export const RIGHTS_PATH = "security/rights.yaml";

/** Charge d'une opération `right.create|delete` : une restriction, ou une règle de propriété (B794, B817). */
interface RightPayload {
  role?: RightRestriction["role"];
  permission?: RightRestriction["permission"];
  restriction?: string;
  ownershipRule?: string;
}

export const readRights = (workspace: Workspace): RightsFile =>
  workspace.files.has(RIGHTS_PATH)
    ? readEntity(workspace, RIGHTS_PATH, (spec) => spec.rights)
    : { matrice: [], restrictions: [], propriete: [] };

const keyOf = (entry: RightPayload) => `${entry.role}\n${entry.permission}\n${entry.restriction}`;

function restrictionsAfter(file: RightsFile, payload: RightPayload, added: boolean) {
  const others = file.restrictions.filter((entry) => keyOf(entry) !== keyOf(payload));
  return added ? [...others, payload as RightRestriction] : others;
}

function rulesAfter(rules: readonly string[], rule: string, added: boolean): string[] {
  const others = rules.filter((entry) => entry !== rule);
  return added ? [...others, rule] : others;
}

/**
 * `right.create|delete` : seuls les restrictions et les règles de propriété changent ; la matrice est recalculée ensuite
 * depuis les rôles (`abuse-generated.ts`). Aucun octroi ni retrait de permission.
 */
export function applyRight(workspace: Workspace, operation: BatchOperation): void {
  forbidDesigner(workspace);
  const file = readRights(workspace);
  const payload = operation.payload as RightPayload;
  const added = operation.kind === "right.create";
  const rule = payload.ownershipRule;
  const next: RightsFile =
    rule === undefined
      ? { ...file, restrictions: restrictionsAfter(file, payload, added) }
      : { ...file, propriete: rulesAfter(file.propriete, rule, added) };
  writeEntity(workspace, RIGHTS_PATH, "rights", () => emitRightsYaml(next));
}

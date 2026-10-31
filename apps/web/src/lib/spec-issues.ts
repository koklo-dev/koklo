import type { FieldKey } from "./feature-form.ts";

/** Squelette Red (TK-48 / 48e) : rattache un diagnostic `SPEC_INVALID` à un champ du formulaire (best effort, Q5). */
export interface IssueLike {
  pointer: string;
  entityId?: string | undefined;
}
export function fieldOfIssue(_issue: IssueLike): FieldKey | null {
  throw new Error("fieldOfIssue : non implémenté");
}

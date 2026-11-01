import type { FieldKey } from "./feature-form.ts";

/** Rattache un diagnostic `SPEC_INVALID` à un champ du formulaire (best effort, Q5 : repli = la liste). */
export interface IssueLike {
  pointer: string;
  entityId?: string | undefined;
}

const KNOWN_FIELDS: readonly FieldKey[] = [
  "title",
  "priority",
  "status",
  "description",
  "criteria",
  "screens",
  "roles",
  "rules",
  "tables",
  "endpoints",
  "nfr",
];

/** Premier segment du pointeur qui nomme un champ (`/criteria/0/title` -> `criteria`), sinon `null`. */
export function fieldOfIssue(issue: IssueLike): FieldKey | null {
  const segments = issue.pointer.split("/");
  const named = segments.find((segment) => (KNOWN_FIELDS as readonly string[]).includes(segment));
  return (named as FieldKey | undefined) ?? null;
}

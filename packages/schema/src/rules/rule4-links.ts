import type { IssueCode } from "../codes.ts";
import { ruleIssue } from "../issue.ts";
import type { Issue } from "../types.ts";

export type Emit = (code: IssueCode, pointer: string, message: string) => void;

export function emitterFor(out: Issue[], path: string, entityId: string | undefined): Emit {
  return (code, pointer, message) => {
    out.push(ruleIssue(4, code, path, pointer, entityId, message));
  };
}

function checkList(
  items: readonly string[] | undefined,
  base: string,
  known: (id: string) => boolean,
  code: IssueCode,
  label: string,
  emit: Emit,
): void {
  (items ?? []).forEach((id, i) => {
    if (!known(id)) emit(code, `${base}/${i}`, `${label} ${id} n'existe pas.`);
  });
}

export type Collect = (path: string, entityId: string) => Emit;

/** Liens de listes (`tables`, `endpoints`, ...) : un contrôle par couple (liste, règle). */
export function checkLinks(
  checks: readonly {
    items: readonly string[] | undefined;
    base: string;
    known: { has(id: string): boolean };
    code: IssueCode;
    label: string;
  }[],
  emit: Emit,
): void {
  for (const c of checks)
    checkList(c.items, c.base, (id) => c.known.has(id), c.code, c.label, emit);
}

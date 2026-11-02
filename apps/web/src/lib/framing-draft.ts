import type { StorageScope } from "./feature-draft.ts";
import type { FramingDraft } from "./framing-types.ts";

/** SQUELETTE (TK-59 Red) : brouillon local de cadrage, cloisonné par compte et organisation (S-framing §5.3). */
export const FRAMING_DRAFT_PREFIX = "koklo:framing-draft:";
export const framingDraftKey = (projectId: string): string => `${FRAMING_DRAFT_PREFIX}${projectId}`;

export function saveFramingDraft(
  _scope: StorageScope | null,
  _projectId: string,
  _draft: FramingDraft,
): boolean {
  throw new Error("TK-59 : saveFramingDraft n'est pas implémenté");
}

export function readFramingDraft(
  _scope: StorageScope | null,
  _projectId: string,
  _now?: number,
): FramingDraft | null {
  throw new Error("TK-59 : readFramingDraft n'est pas implémenté");
}

export function clearFramingDraft(_projectId: string): void {
  throw new Error("TK-59 : clearFramingDraft n'est pas implémenté");
}

/**
 * Renforcement de la suite de conformité (TK-54a, non bloquants de la review 50c). Les capacités
 * du sujet sont FACULTATIVES : un sujet qui ne les fournit pas (le faux) passe ces cas sans les
 * exercer. Au Green, ces membres rejoignent `LlmConformanceSubject` et les cas
 * `LLM_CONFORMANCE_HARDENING_CASE_NAMES` rejoignent `LLM_CONFORMANCE_CASE_NAMES`.
 */
export interface LlmConformanceHardeningSubject {
  /** Le prochain appel reste en attente jusqu'à l'annulation de son signal (transport bloqué). */
  hangNext?(): void | Promise<void>;
  /** Lignes écrites par le sujet (console, journal) depuis sa création ; jamais de secret. */
  capturedLogs?(): readonly string[];
}

export const LLM_CONFORMANCE_HARDENING_CASE_NAMES = [
  "rejects with LlmAbortedError when aborted during the call",
  "makes at most one provider call per complete, even on failure",
  "carries no cause and no secret in any property of its errors",
  "writes no secret to its logs",
  "returns text output as unvalidated, never validated",
] as const;

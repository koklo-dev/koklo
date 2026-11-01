import type { Severity } from "./catalog-types.ts";

export const VERDICTS = ["PASS", "FAIL", "UNVERIFIED"] as const;
export type Verdict = (typeof VERDICTS)[number];

export const VERDICT_REASONS = [
  "gate-passed",
  "gate-failed",
  "gate-not-run",
  "evidence-provided",
  "evidence-missing",
  "evidence-incomplete",
] as const;
export type VerdictReason = (typeof VERDICT_REASONS)[number];

export const EVIDENCE_ERROR_CODES = ["evidence.invalid-shape"] as const;
export type EvidenceErrorCode = (typeof EVIDENCE_ERROR_CODES)[number];

/** Preuve pour une règle `evidence` : `references` = renvois (fichier, URL, id), au moins un. */
export interface EvidenceItem {
  readonly ruleId: string;
  readonly references: readonly string[];
}

/** Résultat d'un gate exécuté ailleurs (CI) : ce paquet n'exécute rien. */
export interface GateResult {
  readonly ruleId: string;
  readonly status: "pass" | "fail";
}

/** Artefact de preuve, entrée `unknown` de `validateEvidence` (JSON déjà lu). */
export interface EvidenceArtifact {
  readonly evidence?: readonly EvidenceItem[];
  readonly gates?: readonly GateResult[];
}

export interface RuleVerdict {
  readonly ruleId: string;
  readonly severity: Severity;
  readonly kind: "gate" | "evidence";
  readonly verdict: Verdict;
  readonly reason: VerdictReason;
}

export interface EvidenceReport {
  /** Un verdict par règle `gate` ou `evidence` de la résolution, triés par ruleId. */
  readonly verdicts: readonly RuleVerdict[];
  /** Ids prouvés mais absents de la résolution (inconnus ou hors portée), triés, uniques. */
  readonly unknownRuleIds: readonly string[];
  /** FAIL si une règle blocking est FAIL, sinon UNVERIFIED si une blocking est UNVERIFIED, sinon PASS. */
  readonly overall: Verdict;
  /** `overall === "PASS"` ; les règles advisory n'y entrent jamais. */
  readonly canPass: boolean;
}

/** Erreur d'entrée : ne reprend jamais le texte d'une preuve. */
export interface EvidenceError {
  readonly code: EvidenceErrorCode;
  readonly message: string;
  /** Chemin dans l'artefact (ex. `evidence.0.references`). */
  readonly path?: string;
}

export type EvidenceResult =
  | { readonly ok: true; readonly value: EvidenceReport }
  | { readonly ok: false; readonly error: EvidenceError };

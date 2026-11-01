import type { EvidenceArtifact, RuleVerdict, Verdict, VerdictReason } from "./evidence-types.ts";
import type { EffectiveRule } from "./layer-types.ts";

/** Espaces, contrôles, caractères de format (largeur nulle) et remplisseurs : aucune preuve visible. */
const INVISIBLE_ONLY = /^[\p{White_Space}\p{Cc}\p{Cf}\p{Zs}\u115f\u1160\u2800\u3164\uffa0]*$/u;

type Outcome = readonly [verdict: Verdict, reason: VerdictReason];

const gateOutcome = (id: string, artifact: EvidenceArtifact): Outcome => {
  const results = (artifact.gates ?? []).filter((gate) => gate.ruleId === id);
  if (results.some((gate) => gate.status === "fail")) return ["FAIL", "gate-failed"];
  return results.length > 0 ? ["PASS", "gate-passed"] : ["UNVERIFIED", "gate-not-run"];
};

const evidenceOutcome = (id: string, artifact: EvidenceArtifact): Outcome => {
  const items = (artifact.evidence ?? []).filter((item) => item.ruleId === id);
  if (items.length === 0) return ["UNVERIFIED", "evidence-missing"];
  const complete = items.some((item) => item.references.some((ref) => !INVISIBLE_ONLY.test(ref)));
  return complete ? ["PASS", "evidence-provided"] : ["UNVERIFIED", "evidence-incomplete"];
};

/** Verdict d'une règle effective ; `undefined` pour une `instruction` (rien à prouver). */
export const verdictFor = (
  rule: EffectiveRule,
  artifact: EvidenceArtifact,
): RuleVerdict | undefined => {
  const kind = rule.enforcement.kind;
  if (kind === "instruction") return undefined;
  const [verdict, reason] =
    kind === "gate" ? gateOutcome(rule.id, artifact) : evidenceOutcome(rule.id, artifact);
  return { ruleId: rule.id, severity: rule.severity, kind, verdict, reason };
};

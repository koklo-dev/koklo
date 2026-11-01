import { z } from "zod";
import { compareText, sortedUnique } from "./compare.ts";
import type {
  EvidenceArtifact,
  EvidenceError,
  EvidenceReport,
  EvidenceResult,
  RuleVerdict,
  Verdict,
} from "./evidence-types.ts";
import { frozenCopy } from "./freeze.ts";
import type { Resolution } from "./resolve-types.ts";
import { verdictFor } from "./verdict.ts";

const ruleId = z.string().min(1);
const artifactSchema = z.strictObject({
  evidence: z.array(z.strictObject({ ruleId, references: z.array(z.string()) })).optional(),
  gates: z.array(z.strictObject({ ruleId, status: z.enum(["pass", "fail"]) })).optional(),
});

/** Erreur sans aucun texte de l'artefact : seul le chemin du champ fautif est repris. */
const invalidShape = (path: readonly PropertyKey[]): EvidenceError => {
  const joined = path.map(String).join(".");
  const base = {
    code: "evidence.invalid-shape" as const,
    message: "the evidence artifact is malformed",
  };
  return joined === "" ? base : { ...base, path: joined };
};

type Parsed =
  | { readonly ok: true; readonly artifact: EvidenceArtifact }
  | { readonly ok: false; readonly error: EvidenceError };

const parseArtifact = (input: unknown): Parsed => {
  try {
    const parsed = artifactSchema.safeParse(input);
    return parsed.success
      ? { ok: true, artifact: parsed.data }
      : { ok: false, error: invalidShape(parsed.error.issues[0]?.path ?? []) };
  } catch {
    return { ok: false, error: invalidShape([]) };
  }
};

const worst = (verdicts: readonly RuleVerdict[], severity: RuleVerdict["severity"]): Verdict => {
  const blocking = verdicts.filter((verdict) => verdict.severity === severity);
  if (blocking.some((verdict) => verdict.verdict === "FAIL")) return "FAIL";
  return blocking.some((verdict) => verdict.verdict === "UNVERIFIED") ? "UNVERIFIED" : "PASS";
};

const buildReport = (resolution: Resolution, artifact: EvidenceArtifact): EvidenceReport => {
  const verdicts = resolution.rules
    .flatMap((rule) => verdictFor(rule, artifact) ?? [])
    .sort((a, b) => compareText(a.ruleId, b.ruleId));
  const judged = new Set(verdicts.map((verdict) => verdict.ruleId));
  const proven = [...(artifact.evidence ?? []), ...(artifact.gates ?? [])].map(
    (item) => item.ruleId,
  );
  const overall = worst(verdicts, "blocking");
  return {
    verdicts,
    unknownRuleIds: sortedUnique(proven.filter((id) => !judged.has(id))),
    overall,
    canPass: overall === "PASS",
  };
};

/** Verdicts PASS / FAIL / UNVERIFIED des règles effectives (équivalent de `engineering-rules
 *  validate`). Pure, ne lève jamais, ne copie aucune référence dans le rapport. */
export const validateEvidence = (resolution: Resolution, artifact: unknown): EvidenceResult => {
  const parsed = parseArtifact(artifact);
  return parsed.ok
    ? { ok: true, value: frozenCopy(buildReport(resolution, parsed.artifact)) }
    : parsed;
};

import {
  AI_USAGES,
  type AiUsage,
  framePrompt,
  type LlmBudget,
  type LlmCredential,
  LlmInvalidOutputError,
  type LlmProvider,
  type LlmProviderId,
  LlmRefusedError,
  type LlmRequest,
  trusted,
  Untrusted,
} from "@koklo/domain";
import { QUALIFICATION_CASES, type QualificationCase } from "./cases.ts";

/** Contrat de sortie d'un usage : le schéma demandé au modèle et la validation qui fait foi (Zod côté API). */
export interface UsageContract {
  readonly jsonSchema: Readonly<Record<string, unknown>>;
  accepts(raw: unknown): boolean;
}
export type QualificationContracts = Readonly<Record<AiUsage, UsageContract>>;

export const FAILURE_REASONS = ["schema", "invalid-json", "truncated", "refused", "error"] as const;
export type FailureReason = (typeof FAILURE_REASONS)[number];

export interface CaseFailure {
  readonly caseId: string;
  readonly reason: FailureReason;
}
export interface UsageQualification {
  readonly qualified: boolean;
  readonly failures: readonly CaseFailure[];
}

/** Rapport : ni sortie du modèle, ni clé, ni prompt ; seulement le verdict par usage. */
export interface QualificationReport {
  readonly provider: LlmProviderId;
  readonly model: string;
  readonly usages: Readonly<Record<AiUsage, UsageQualification>>;
}

export interface QualificationInput {
  readonly provider: LlmProvider;
  readonly providerId: LlmProviderId;
  readonly model: string;
  readonly credential: LlmCredential;
  readonly baseUrl?: string;
  readonly contracts: QualificationContracts;
}

const NONCE = "QualifNonce0001Zq";
const BUDGET: LlmBudget = {
  maxOutputTokens: 4_000,
  timeoutMs: 90_000,
  maxPromptChars: 20_000,
  maxCostMicroUsd: 1_000_000,
};

const INSTRUCTIONS = {
  idea_space: trusted`Tu aides à cadrer une idée de produit. Rends un objet JSON conforme au schéma, en français, à partir de l'énoncé.`,
  spec_deliverables: trusted`Tu rédiges les livrables d'une spécification. Rends un objet JSON conforme au schéma, en français, à partir de l'énoncé.`,
  baseline_summary: trusted`Tu résumes l'état d'une version de référence. Rends un objet JSON conforme au schéma, en français, à partir de l'énoncé.`,
  ticket_breakdown: trusted`Tu découpes une fonctionnalité en tickets. Rends un objet JSON conforme au schéma, en français, à partir de l'énoncé.`,
} as const;

const requestFor = (
  usage: AiUsage,
  input: QualificationInput,
  c: QualificationCase,
): LlmRequest => ({
  model: input.model,
  credential: input.credential,
  prompt: framePrompt({
    instructions: INSTRUCTIONS[usage],
    data: [new Untrusted("brief", c.brief)],
    nonce: NONCE,
  }),
  output: { kind: "json", schema: input.contracts[usage].jsonSchema },
  budget: BUDGET,
  ...(input.baseUrl === undefined ? {} : { baseUrl: input.baseUrl }),
  trace: { purpose: usage, correlationId: `qualif-${c.id}` },
});

const reasonOfError = (error: unknown): FailureReason => {
  if (error instanceof LlmRefusedError) {
    return "refused";
  }
  return error instanceof LlmInvalidOutputError ? "invalid-json" : "error";
};

/** Verdict d'un dossier : `undefined` si la sortie est conforme. */
const judge = async (
  usage: AiUsage,
  input: QualificationInput,
  c: QualificationCase,
): Promise<FailureReason | undefined> => {
  try {
    const response = await input.provider.complete(requestFor(usage, input, c));
    if (response.stop !== "end" && response.stop !== "stop-sequence") {
      return response.stop === "refusal" ? "refused" : "truncated";
    }
    return input.contracts[usage].accepts(response.output as unknown) ? undefined : "schema";
  } catch (error) {
    return reasonOfError(error);
  }
};

const qualifyUsage = async (
  usage: AiUsage,
  input: QualificationInput,
): Promise<UsageQualification> => {
  const failures: CaseFailure[] = [];
  for (const c of QUALIFICATION_CASES[usage]) {
    const reason = await judge(usage, input, c);
    if (reason !== undefined) {
      failures.push({ caseId: c.id, reason });
    }
  }
  return { qualified: failures.length === 0, failures };
};

/** Passe chaque dossier de chaque usage au modèle ; un seul échec disqualifie l'usage. */
export const runQualification = async (input: QualificationInput): Promise<QualificationReport> => {
  const usages: Partial<Record<AiUsage, UsageQualification>> = {};
  for (const usage of AI_USAGES) {
    usages[usage] = await qualifyUsage(usage, input);
  }
  return {
    provider: input.providerId,
    model: input.model,
    usages: usages as Record<AiUsage, UsageQualification>,
  };
};

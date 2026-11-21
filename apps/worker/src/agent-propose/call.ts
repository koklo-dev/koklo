import { randomBytes } from "node:crypto";
import {
  AGENT_PROPOSE_LIMITS,
  type AgentProposalKind,
  type AiProvider,
  type FramedPrompt,
  validateLlmOutput,
} from "@koklo/domain";
import { PROPOSAL_BUDGETS, type ProposalPurpose } from "@koklo/llm";
import { OutputInvalidError, OutputRefusedError, OutputTruncatedError } from "./errors.ts";
import type { LaunchSources } from "./sources.ts";
import type { LaunchContext, LaunchProgress, ProposeStore } from "./store.ts";
import type { TriageContext } from "./triage.ts";

export interface GenerateDeps {
  readonly store: ProposeStore;
  readonly ai: AiProvider;
  /** Nonce neuf à chaque appel (le domaine n'a pas d'aléa). */
  readonly nonce?: () => string;
  /** Durée de travail d'un segment, en ms (B617) : au-delà, le segment passe le relais au suivant. */
  readonly deadlineMs: number;
  readonly now: () => Date;
}

/** Ce qu'un segment sait de son lancement : sources, progression stockée, contexte de tri reconstruit, début du segment. */
export interface Run {
  readonly deps: GenerateDeps;
  readonly launch: LaunchContext;
  readonly sources: LaunchSources;
  readonly euOnly: boolean;
  readonly progress: LaunchProgress;
  readonly kinds: readonly AgentProposalKind[];
  readonly context: TriageContext;
  readonly started: number;
}

/**
 * Le segment a épuisé son temps (vérifié avant chaque appel) : il passe le relais, ou, au huitième segment, le lancement
 * s'arrête au délai (B617). `undefined` : il reste du temps.
 */
export function timeUp(run: Run): "handoff" | "deadline" | undefined {
  if (run.deps.now().getTime() - run.started <= run.deps.deadlineMs) return undefined;
  return run.progress.segment + 1 >= AGENT_PROPOSE_LIMITS.segments ? "deadline" : "handoff";
}

const randomNonce = (): string => randomBytes(24).toString("hex");

/** Arrêt anormal du modèle : motif fermé (B618), jamais le texte du fournisseur. */
function abnormalStop(stop: string): OutputInvalidError {
  if (stop === "max-tokens") return new OutputTruncatedError();
  if (stop === "refusal") return new OutputRefusedError();
  return new OutputInvalidError();
}

/** Un appel au modèle : battement, appel routé, arrêt normal exigé, sortie validée par `parse`. */
export async function ask<T>(
  run: Run,
  call: {
    purpose: ProposalPurpose;
    prompt: (nonce: string) => FramedPrompt;
    schema: Record<string, unknown>;
    parse: (raw: unknown) => T;
  },
): Promise<T> {
  const { deps, launch } = run;
  await deps.store.heartbeat(launch);
  const response = await deps.ai.complete({
    organizationId: launch.organizationId,
    userId: launch.requestedBy,
    usage: "spec_deliverables",
    euOnly: run.euOnly,
    prompt: call.prompt((deps.nonce ?? randomNonce)()),
    output: { kind: "json", schema: call.schema },
    budget: PROPOSAL_BUDGETS[call.purpose],
    trace: { purpose: call.purpose, correlationId: launch.id },
  });
  if (response.stop !== "end") throw abnormalStop(response.stop);
  return validateLlmOutput(response.output, call.parse).value;
}

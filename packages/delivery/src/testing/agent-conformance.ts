/** Suite de conformité partagée par tout AgentRuntime (moteur de test injecté, aucun import vitest). */
import type { AgentRuntime } from "../agent-runtime.ts";

export class AgentConformanceFailure extends Error {}

export const AGENT_FAILURE_TRIGGERS: readonly AgentConformanceTrigger[] = [];
export type AgentConformanceTrigger = "failed" | "timeout" | "quota" | "unavailable" | "auth";

export interface AgentConformanceSubject {
  readonly runtime: AgentRuntime;
  /** Clé que le sujet reçoit : elle ne doit apparaître dans aucun résultat ni aucune erreur. */
  readonly validKey: string;
  /** Programme la prochaine session : complétée avec cette sortie brute. */
  replyWith(output: string): void | Promise<void>;
  /** Programme la prochaine session en échec typé, la sortie brute pouvant porter un secret. */
  trigger(kind: AgentConformanceTrigger, output?: string): void | Promise<void>;
  /** Programme la prochaine session : elle ne rend la main que si le signal est annulé. */
  hangUntilAborted(): void | Promise<void>;
  /** Nombre de sessions réellement lancées (0 si la garde ou le signal annulé les a évitées). */
  launchesMade(): number;
}
export type AgentConformanceFactory = () =>
  | AgentConformanceSubject
  | Promise<AgentConformanceSubject>;

export interface AgentConformanceCase {
  readonly name: string;
  run(factory: AgentConformanceFactory): Promise<void>;
}

export const AGENT_CONFORMANCE_CASE_NAMES: readonly string[] = [];

export const agentRuntimeConformanceCases = (): readonly AgentConformanceCase[] => {
  throw new Error("not implemented");
};

export interface AgentConformanceHarness {
  describe(name: string, body: () => void): void;
  it(name: string, body: () => Promise<void> | void): void;
}

export const runAgentRuntimeConformance = (
  name: string,
  _factory: AgentConformanceFactory,
  harness: AgentConformanceHarness,
): void => {
  harness.describe(name, () => {
    harness.it("not implemented", () => {
      throw new Error("not implemented");
    });
  });
};

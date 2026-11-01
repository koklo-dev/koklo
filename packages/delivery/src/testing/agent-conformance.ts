/** Suite de conformité partagée par tout AgentRuntime (moteur de test injecté, aucun import vitest). */
import { CONFORMANCE_CASES } from "./conformance-cases.ts";
import type {
  AgentConformanceCase,
  AgentConformanceFactory,
  AgentConformanceHarness,
} from "./conformance-types.ts";

export const AGENT_CONFORMANCE_CASE_NAMES: readonly string[] = CONFORMANCE_CASES.map((c) => c.name);

export const agentRuntimeConformanceCases = (): readonly AgentConformanceCase[] =>
  CONFORMANCE_CASES;

/** Enregistre un `describe` et un `it` par cas auprès du moteur de test fourni. */
export const runAgentRuntimeConformance = (
  name: string,
  factory: AgentConformanceFactory,
  harness: AgentConformanceHarness,
): void => {
  harness.describe(name, () => {
    for (const testCase of CONFORMANCE_CASES) {
      harness.it(testCase.name, () => testCase.run(factory));
    }
  });
};

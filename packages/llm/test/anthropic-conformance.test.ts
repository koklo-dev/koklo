import {
  type LlmConformanceFactory,
  type LlmConformanceHardeningSubject,
  type LlmConformanceSubject,
  type LlmFailureTrigger,
  runLlmConformance,
} from "@koklo/domain/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AnthropicProvider } from "../src/index.ts";
import {
  anthropicErrorBody,
  SimulatedAnthropicTransport,
  type SimulatedStep,
} from "../src/testing/index.ts";

const VALID_KEY = "sk-ant-conformance-VALIDE-0001";
const INVALID_KEY = "sk-ant-conformance-REFUSEE-0002";
const SERVED_MODEL = "claude-conformance-servi-1";

const error = (status: number, type: string, message: string, headers = {}): SimulatedStep => ({
  kind: "http",
  status,
  headers,
  json: anthropicErrorBody(type, message),
});

const FAILURES: Record<LlmFailureTrigger, SimulatedStep> = {
  "rate-limited": error(429, "rate_limit_error", "rate limited", { "retry-after": "999999999999" }),
  timeout: { kind: "timeout" },
  unavailable: error(529, "overloaded_error", "Overloaded"),
  refused: { kind: "message", text: "refus", stopReason: "refusal" },
  quota: error(402, "billing_error", "billing"),
  "model-not-found": error(404, "not_found_error", "model: inconnu"),
  "context-too-long": error(400, "invalid_request_error", "prompt is too long: 250000 tokens"),
};

const logs: string[] = [];

const subject = (): LlmConformanceSubject & LlmConformanceHardeningSubject => {
  const transport = new SimulatedAnthropicTransport({
    rejectedKeys: [INVALID_KEY],
    servedModel: SERVED_MODEL,
  });
  for (const method of ["log", "info", "warn", "error", "debug"] as const) {
    vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    });
  }
  return {
    provider: new AnthropicProvider({ fetch: transport.fetch }),
    validKey: VALID_KEY,
    invalidKey: INVALID_KEY,
    servedModel: SERVED_MODEL,
    replyWith: (output) => {
      const text = typeof output === "string" ? output : JSON.stringify(output);
      transport.enqueue({ kind: "message", text });
    },
    failWith: (trigger) => {
      transport.enqueue(FAILURES[trigger]);
    },
    callsMade: () => transport.calls(),
    hangNext: () => {
      transport.enqueue({ kind: "hang" });
    },
    capturedLogs: () => [...logs],
  };
};

afterEach(() => {
  vi.restoreAllMocks();
  logs.length = 0;
});

// La même suite que le faux (TK-50c), exécutée sur l'adaptateur avec le transport simulé :
// 11 cas existants + les cas renforcés (annulation en cours d'appel, un seul appel, pas de cause).
const factory: LlmConformanceFactory = () => subject();
runLlmConformance("AnthropicProvider (transport simulé)", factory, { describe, it });

describe("conformité renforcée : le sujet fournit les capacités facultatives", () => {
  it("expose hangNext et capturedLogs (sinon les cas renforcés ne s'exerceraient pas)", () => {
    const s = subject();
    expect(typeof s.hangNext).toBe("function");
    expect(typeof s.capturedLogs).toBe("function");
  });
});

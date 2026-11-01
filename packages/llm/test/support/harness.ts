import { inspect } from "node:util";
import {
  framePrompt,
  type LlmBudget,
  LlmProviderError,
  type LlmRequest,
  llmCredential,
  trusted,
  Untrusted,
} from "@koklo/domain";
import { AnthropicProvider } from "../../src/index.ts";
import { SimulatedAnthropicTransport } from "../../src/testing/index.ts";

/** Sentinelles : tout test de non-fuite les cherche partout. */
export const KEY = "sk-ant-api03-SENTINELLE-CLE-0123456789";
export const PROMPT_SENTINEL = "PROMPT-SENTINELLE-ANTHROPIC";
export const OUTPUT_SENTINEL = "OUTPUT-SENTINELLE-ANTHROPIC";
export const ERROR_BODY_SENTINEL = "CORPS-ERREUR-SENTINELLE-ANTHROPIC";
export const HEADER_SENTINEL = "EN-TETE-SENTINELLE-ANTHROPIC";
export const NONCE = "N0nceDeTest9876Zq";
export const SECRETS = [
  KEY,
  PROMPT_SENTINEL,
  OUTPUT_SENTINEL,
  ERROR_BODY_SENTINEL,
  HEADER_SENTINEL,
];

export const BUDGET: LlmBudget = {
  maxOutputTokens: 1_000,
  timeoutMs: 30_000,
  maxPromptChars: 10_000,
  maxCostMicroUsd: 5_000_000,
};

export const PROMPT = framePrompt({
  instructions: trusted`Résume les données.`,
  data: [new Untrusted("brief", PROMPT_SENTINEL)],
  nonce: NONCE,
});

export const makeRequest = (overrides: Partial<LlmRequest> = {}): LlmRequest => ({
  model: "claude-sonnet-5-5",
  credential: llmCredential(KEY),
  prompt: PROMPT,
  output: { kind: "text" },
  budget: BUDGET,
  trace: { purpose: "brief-draft", correlationId: "req-0001" },
  ...overrides,
});

export interface Bench {
  readonly transport: SimulatedAnthropicTransport;
  readonly provider: AnthropicProvider;
  /** Clés brutes vues par le transport (le seul endroit où la clé est lisible). */
  readonly sentKeys: string[];
}

export const bench = (options: { servedModel?: string } = {}): Bench => {
  const sentKeys: string[] = [];
  const transport = new SimulatedAnthropicTransport({
    ...options,
    onRequest: (headers) => sentKeys.push(headers["x-api-key"] ?? ""),
  });
  return { transport, provider: new AnthropicProvider({ fetch: transport.fetch }), sentKeys };
};

/** L'erreur levée par l'appel (l'appel doit échouer). */
export const rejection = async (call: Promise<unknown>): Promise<Error> => {
  try {
    await call;
  } catch (error) {
    return error as Error;
  }
  throw new Error("l'appel aurait dû être rejeté");
};

const ownValues = (value: unknown, seen: Set<unknown>): unknown[] => {
  if (typeof value !== "object" || value === null || seen.has(value)) {
    return [value];
  }
  seen.add(value);
  const own = Reflect.ownKeys(value).flatMap((key) => [
    String(key),
    ...ownValues(Object.getOwnPropertyDescriptor(value, key)?.value, seen),
  ]);
  return [value, ...own];
};

/** Rendus d'une erreur : message, stack, JSON, inspect profond, String, toutes propriétés propres. */
export const renderings = (error: unknown): string => {
  const failure = error as Error;
  const walked = ownValues(error, new Set()).map((v) => (typeof v === "string" ? v : String(v)));
  return [
    failure.message,
    failure.stack,
    JSON.stringify(error),
    inspect(error, { depth: 10, showHidden: true }),
    String(error),
    ...walked,
  ].join("\n");
};

/** Sentinelles retrouvées dans l'erreur ; une erreur non typée du port compte comme une fuite. */
export const expectNoLeak = (error: unknown, secrets: readonly string[] = SECRETS): string[] =>
  error instanceof LlmProviderError
    ? secrets.filter((secret) => renderings(error).includes(secret))
    : ["erreur non typée du port"];

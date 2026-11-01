import {
  framePrompt,
  type LlmBudget,
  type LlmRequest,
  llmCredential,
  trusted,
  Untrusted,
} from "../src/index.ts";

/** Clé et prompt sentinelles : les tests de non-fuite les cherchent partout. */
export const SECRET_KEY = "sk-test-SENTINELLE-0123456789";
export const PROMPT_TEXT = "Données sensibles PROMPT-SENTINELLE";
export const NONCE = "k3Zq9TxW7mB2vLpD";

export const BUDGET: LlmBudget = {
  maxOutputTokens: 1_000,
  timeoutMs: 30_000,
  maxPromptChars: 10_000,
  maxCostMicroUsd: 100_000,
};

export const makePrompt = (text = PROMPT_TEXT) =>
  framePrompt({
    instructions: trusted`Résume les données.`,
    data: [new Untrusted("brief", text)],
    nonce: NONCE,
  });

/** Requête valide ; chaque test en dérive une variante. */
export const makeRequest = (overrides: Partial<LlmRequest> = {}): LlmRequest => ({
  model: "claude-test-1",
  credential: llmCredential(SECRET_KEY),
  prompt: makePrompt(),
  output: { kind: "text" },
  budget: BUDGET,
  trace: { purpose: "brief-to-features", correlationId: "req-0001" },
  ...overrides,
});

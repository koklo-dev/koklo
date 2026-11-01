import { describe, expect, it } from "vitest";
import {
  ANTHROPIC_API_VERSION,
  ANTHROPIC_DEFAULT_MODEL,
  ANTHROPIC_MESSAGES_URL,
} from "../src/index.ts";
import { bench, KEY, makeRequest, PROMPT } from "./support/harness.ts";

const FORBIDDEN_BODY_KEYS = [
  "tools",
  "tool_choice",
  "stop_sequences",
  "thinking",
  "metadata",
  "stream",
  "top_k",
  "top_p",
  "service_tier",
  "mcp_servers",
  "container",
];

const sendOnce = async (overrides = {}) => {
  const { transport, provider, sentKeys } = bench();
  transport.enqueue({ kind: "message", text: "bonjour" });
  await provider.complete(makeRequest(overrides));
  const sent = transport.requests[0];
  if (sent === undefined) throw new Error("aucune requête envoyée");
  return { sent, transport, sentKeys };
};

describe("requête sortante (POST /v1/messages)", () => {
  it("vise l'URL fixe de l'API Anthropic et aucune autre", async () => {
    const { sent, transport } = await sendOnce();
    expect(ANTHROPIC_MESSAGES_URL).toBe("https://api.anthropic.com/v1/messages");
    expect(sent.url).toBe("https://api.anthropic.com/v1/messages");
    expect(sent.method).toBe("POST");
    expect(transport.calls()).toBe(1);
  });

  it("n'envoie que la clé, la version d'API et le type de contenu en en-têtes", async () => {
    const { sent, sentKeys } = await sendOnce();
    expect(ANTHROPIC_API_VERSION).toBe("2023-06-01");
    expect(Object.keys(sent.headers).sort()).toEqual([
      "anthropic-version",
      "content-type",
      "x-api-key",
    ]);
    expect(sent.headers["anthropic-version"]).toBe("2023-06-01");
    expect(sent.headers["content-type"]).toBe("application/json");
    expect(sentKeys).toEqual([KEY]);
  });

  it("la clé n'est ni dans l'URL, ni dans le corps, ni dans un autre en-tête", async () => {
    const { sent } = await sendOnce();
    expect(sent.url).not.toContain(KEY);
    expect(sent.rawBody).not.toContain(KEY);
    const others = Object.entries(sent.headers).filter(([name]) => name !== "x-api-key");
    expect(JSON.stringify(others)).not.toContain(KEY);
  });

  it("envoie le prompt cadré tel quel : system et user, un seul message", async () => {
    const { sent } = await sendOnce();
    expect(sent.body).toEqual({
      model: "claude-sonnet-5-5",
      max_tokens: 1_000,
      system: PROMPT.system,
      messages: [{ role: "user", content: PROMPT.user }],
    });
    const body = sent.body as { system: string; messages: { content: string }[] };
    expect(body.system).toContain("untrusted data");
    expect(body.messages[0]?.content).toMatch(/^<<<DATA 1 origin=brief nonce=N0nceDeTest9876Zq>>>/);
  });

  it("n'envoie aucun outil, flux, métadonnée, arrêt, réflexion ni paramètre d'échantillonnage", async () => {
    const { sent } = await sendOnce();
    for (const key of FORBIDDEN_BODY_KEYS) {
      expect(Object.keys(sent.body as object), key).not.toContain(key);
    }
  });

  it("max_tokens vaut budget.maxOutputTokens", async () => {
    const { sent } = await sendOnce({
      budget: {
        maxOutputTokens: 321,
        timeoutMs: 30_000,
        maxPromptChars: 10_000,
        maxCostMicroUsd: 5_000_000,
      },
    });
    expect((sent.body as { max_tokens: number }).max_tokens).toBe(321);
  });

  it("transmet la température seulement si elle est fournie", async () => {
    const without = await sendOnce();
    expect(Object.keys(without.sent.body as object)).not.toContain("temperature");
    const withTemp = await sendOnce({ temperature: 0.2 });
    expect((withTemp.sent.body as { temperature: number }).temperature).toBe(0.2);
  });

  it("sortie texte : pas de output_config", async () => {
    const { sent } = await sendOnce();
    expect(Object.keys(sent.body as object)).not.toContain("output_config");
  });

  it("sortie JSON : output_config.format json_schema avec le schéma du port, tel quel", async () => {
    const schema = {
      type: "object",
      properties: { features: { type: "array", items: { type: "string" } } },
      required: ["features"],
      additionalProperties: false,
    };
    const { sent } = await sendOnce({ output: { kind: "json", schema } });
    expect((sent.body as { output_config: unknown }).output_config).toEqual({
      format: { type: "json_schema", schema },
    });
  });

  it("ne reprend aucun champ inconnu ajouté à la requête (instantané de la garde)", async () => {
    const { sent } = await sendOnce({ tools: [{ name: "x" }], stream: true } as never);
    expect(Object.keys(sent.body as object).sort()).toEqual([
      "max_tokens",
      "messages",
      "model",
      "system",
    ]);
  });

  it("utilise le modèle demandé tel quel, sans repli silencieux", async () => {
    const { sent } = await sendOnce({ model: "claude-modele-inconnu-9" });
    expect((sent.body as { model: string }).model).toBe("claude-modele-inconnu-9");
    expect(ANTHROPIC_DEFAULT_MODEL).toMatch(/^claude-/);
  });
});

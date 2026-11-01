import { randomUUID } from "node:crypto";
import { LLM_PROVIDER_IDS } from "@koklo/domain";
import { describe, expect, it } from "vitest";
import { llmCredentialAad } from "../src/llm-credential/llm-credential-aad.ts";

/** TK-52a : AAD = `llm:v1:<organization_id>:<provider>`, dérivée à chaque appel, jamais stockée. */
describe("llmCredentialAad", () => {
  const org = randomUUID();

  it("forme exacte", () => {
    expect(llmCredentialAad(org, "anthropic")).toBe(`llm:v1:${org}:anthropic`);
  });

  it("déterministe", () => {
    expect(llmCredentialAad(org, "openai")).toBe(llmCredentialAad(org, "openai"));
  });

  it("organisations ou fournisseurs différents : AAD différentes", () => {
    const all = new Set<string>();
    for (const organization of [org, randomUUID()]) {
      for (const provider of LLM_PROVIDER_IDS) all.add(llmCredentialAad(organization, provider));
    }
    expect(all.size).toBe(2 * LLM_PROVIDER_IDS.length);
  });
});

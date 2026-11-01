import { InvalidLlmRequestError, llmCredential } from "@koklo/domain";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AnthropicProvider } from "../src/index.ts";
import {
  bench,
  ERROR_BODY_SENTINEL,
  expectNoLeak,
  HEADER_SENTINEL,
  KEY,
  makeRequest,
  OUTPUT_SENTINEL,
  PROMPT_SENTINEL,
  rejection,
  SECRETS,
} from "./support/harness.ts";

const echoing = (status: number, type: string) => ({
  kind: "http" as const,
  status,
  headers: { "request-id": `req_${HEADER_SENTINEL}`, "retry-after": "5" },
  json: {
    type: "error",
    error: {
      type,
      message: `${KEY} ${PROMPT_SENTINEL} ${OUTPUT_SENTINEL} ${ERROR_BODY_SENTINEL}`,
    },
  },
});

const STEPS = [
  ["401", echoing(401, "authentication_error")],
  ["402", echoing(402, "billing_error")],
  ["403", echoing(403, "permission_error")],
  ["404", echoing(404, "not_found_error")],
  ["413", echoing(413, "request_too_large")],
  ["429", echoing(429, "rate_limit_error")],
  ["500", echoing(500, "api_error")],
  ["529", echoing(529, "overloaded_error")],
  ["400 crédit", { ...echoing(400, "invalid_request_error") }],
  ["refus", { kind: "message" as const, text: `${OUTPUT_SENTINEL} ${KEY}`, stopReason: "refusal" }],
  ["JSON invalide", { kind: "message" as const, text: `${OUTPUT_SENTINEL} ${KEY}` }],
  ["réseau coupé", { kind: "network-error" as const, detail: `${KEY} ${PROMPT_SENTINEL}` }],
] as const;

afterEach(() => {
  vi.restoreAllMocks();
});

describe("aucune fuite de clé, de prompt, de sortie ni de corps d'erreur", () => {
  it.each(STEPS)("erreur %s : aucun rendu ne contient de sentinelle", async (label, step) => {
    const { transport, provider } = bench();
    transport.enqueue(step);
    const output = label === "JSON invalide" ? { kind: "json" as const, schema: {} } : undefined;
    const error = await rejection(provider.complete(makeRequest(output ? { output } : {})));
    expect(expectNoLeak(error)).toEqual([]);
    expect("cause" in error).toBe(false);
  });

  it("une exception lancée par le transport (message contenant la clé) ne fuit pas", async () => {
    const failing = new Error(`connexion refusée pour ${KEY} ${PROMPT_SENTINEL}`);
    Object.defineProperty(failing, "hidden", { value: KEY, enumerable: false });
    const provider = new AnthropicProvider({ fetch: () => Promise.reject(failing) });
    const error = await rejection(provider.complete(makeRequest()));
    expect(expectNoLeak(error)).toEqual([]);
    expect("cause" in error).toBe(false);
  });

  it("un transport qui lève une valeur non Error (chaîne contenant la clé) ne fuit pas", async () => {
    const provider = new AnthropicProvider({ fetch: () => Promise.reject(`échec ${KEY}`) });
    const error = await rejection(provider.complete(makeRequest()));
    expect(error).toBeInstanceOf(Error);
    expect(expectNoLeak(error)).toEqual([]);
  });

  it("n'écrit rien dans console.* ni sur stdout/stderr, succès comme échec", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation(() => undefined),
    );
    const out = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const err = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const { transport, provider } = bench();
    transport.enqueue({ kind: "message", text: OUTPUT_SENTINEL }, echoing(500, "api_error"));
    await provider.complete(makeRequest());
    await rejection(provider.complete(makeRequest()));
    const written = [...spies, out, err].flatMap((spy) => spy.mock.calls.map(String));
    for (const secret of SECRETS) {
      expect(written.join("\n")).not.toContain(secret);
    }
  });

  it("la clé n'est pas dans l'objet fournisseur ni dans son rendu", () => {
    const { provider } = bench();
    expect(JSON.stringify(provider)).not.toContain(KEY);
    expect(Object.values(provider)).not.toContain(KEY);
    expect(String(llmCredential(KEY))).not.toContain(KEY);
  });

  it("la clé n'est lue qu'au dernier moment : une requête refusée par la garde ne la révèle pas", async () => {
    const { transport, provider, sentKeys } = bench();
    const error = await rejection(provider.complete(makeRequest({ model: "../mauvais" })));
    expect(error).toBeInstanceOf(InvalidLlmRequestError);
    expect(transport.calls()).toBe(0);
    expect(sentKeys).toEqual([]);
  });
});

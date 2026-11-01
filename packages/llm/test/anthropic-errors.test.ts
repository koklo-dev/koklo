import {
  LLM_MAX_RETRY_AFTER_MS,
  LlmAuthError,
  LlmContextTooLongError,
  LlmModelNotFoundError,
  LlmProviderError,
  LlmProviderUnavailableError,
  LlmQuotaExceededError,
  LlmRateLimitedError,
  LlmTimeoutError,
} from "@koklo/domain";
import { describe, expect, it } from "vitest";
import { anthropicErrorBody } from "../src/testing/index.ts";
import {
  bench,
  ERROR_BODY_SENTINEL,
  HEADER_SENTINEL,
  makeRequest,
  rejection,
} from "./support/harness.ts";

type ErrorClass = new (...args: never[]) => LlmProviderError;

interface Row {
  readonly label: string;
  readonly status: number;
  readonly type?: string;
  readonly message?: string;
  readonly expected: ErrorClass;
}

const ROWS: readonly Row[] = [
  {
    label: "401 authentication_error",
    status: 401,
    type: "authentication_error",
    expected: LlmAuthError,
  },
  { label: "403 permission_error", status: 403, type: "permission_error", expected: LlmAuthError },
  {
    label: "402 billing_error",
    status: 402,
    type: "billing_error",
    expected: LlmQuotaExceededError,
  },
  {
    label: "400 solde de crédit trop bas",
    status: 400,
    type: "invalid_request_error",
    message:
      "Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing.",
    expected: LlmQuotaExceededError,
  },
  {
    label: "429 rate_limit_error",
    status: 429,
    type: "rate_limit_error",
    expected: LlmRateLimitedError,
  },
  {
    label: "404 not_found_error",
    status: 404,
    type: "not_found_error",
    expected: LlmModelNotFoundError,
  },
  {
    label: "413 request_too_large",
    status: 413,
    type: "request_too_large",
    expected: LlmContextTooLongError,
  },
  {
    label: "400 prompt is too long",
    status: 400,
    type: "invalid_request_error",
    message: "prompt is too long: 210000 tokens > 200000 maximum",
    expected: LlmContextTooLongError,
  },
  { label: "408 délai", status: 408, type: "timeout_error", expected: LlmTimeoutError },
  { label: "500 api_error", status: 500, type: "api_error", expected: LlmProviderUnavailableError },
  { label: "502", status: 502, expected: LlmProviderUnavailableError },
  { label: "503", status: 503, expected: LlmProviderUnavailableError },
  {
    label: "529 overloaded_error",
    status: 529,
    type: "overloaded_error",
    expected: LlmProviderUnavailableError,
  },
  {
    label: "400 requête mal formée (D5 : pas de 12e erreur)",
    status: 400,
    type: "invalid_request_error",
    message: "messages: text content blocks must be non-empty",
    expected: LlmProviderUnavailableError,
  },
  {
    label: "422",
    status: 422,
    type: "invalid_request_error",
    expected: LlmProviderUnavailableError,
  },
  { label: "409", status: 409, type: "conflict_error", expected: LlmProviderUnavailableError },
];

const failWith = async (row: Row, headers: Record<string, string> = {}) => {
  const { transport, provider } = bench();
  transport.enqueue({
    kind: "http",
    status: row.status,
    headers: { "request-id": `req_${HEADER_SENTINEL}`, ...headers },
    json: anthropicErrorBody(
      row.type ?? "api_error",
      `${row.message ?? "erreur"} ${ERROR_BODY_SENTINEL}`,
    ),
  });
  const error = await rejection(provider.complete(makeRequest()));
  return { error, transport };
};

describe("mapping des erreurs HTTP d'Anthropic vers les erreurs typées du port", () => {
  it.each(ROWS)("$label", async (row) => {
    const { error, transport } = await failWith(row);
    expect(error).toBeInstanceOf(row.expected);
    expect(error).toMatchObject({ provider: "anthropic", operation: "complete" });
    expect(transport.calls()).toBe(1);
  });

  it.each(ROWS.filter((r) => [401, 403, 500, 502, 503, 529, 422, 409].includes(r.status)))(
    "$label : conserve le statut HTTP entier",
    async (row) => {
      const { error } = await failWith(row);
      expect((error as LlmProviderError).status).toBe(row.status);
    },
  );

  it("un 400 inattendu est LlmProviderUnavailableError{status:400}", async () => {
    const { error } = await failWith(ROWS[13] as Row);
    expect(error).toBeInstanceOf(LlmProviderUnavailableError);
    expect((error as LlmProviderError).status).toBe(400);
  });

  it.each(ROWS)("$label : aucune cause, aucun en-tête, aucun corps", async (row) => {
    const { error } = await failWith(row);
    expect(error).toBeInstanceOf(LlmProviderError);
    expect("cause" in error).toBe(false);
    expect(Reflect.ownKeys(error)).not.toContain("cause");
    expect(Object.keys(error)).not.toEqual(expect.arrayContaining(["headers", "body", "error"]));
  });

  it("corps d'erreur non JSON (page HTML d'un proxy) : fournisseur indisponible", async () => {
    const { transport, provider } = bench();
    transport.enqueue({ kind: "http", status: 502, text: `<html>${ERROR_BODY_SENTINEL}</html>` });
    expect(await rejection(provider.complete(makeRequest()))).toBeInstanceOf(
      LlmProviderUnavailableError,
    );
  });

  it("réponse 200 dont le corps n'est pas du JSON : fournisseur indisponible", async () => {
    const { transport, provider } = bench();
    transport.enqueue({ kind: "http", status: 200, text: "pas du json" });
    expect(await rejection(provider.complete(makeRequest()))).toBeInstanceOf(
      LlmProviderUnavailableError,
    );
  });

  it("un statut hors 4xx/5xx sans corps exploitable reste une erreur typée", async () => {
    const { transport, provider } = bench();
    transport.enqueue({ kind: "http", status: 204 });
    expect(await rejection(provider.complete(makeRequest()))).toBeInstanceOf(LlmProviderError);
  });
});

describe("429 : retry-after", () => {
  const rate: Row = {
    label: "429",
    status: 429,
    type: "rate_limit_error",
    expected: LlmRateLimitedError,
  };
  const retryAfterMs = async (headers: Record<string, string>) =>
    ((await failWith(rate, headers)).error as LlmRateLimitedError).retryAfterMs;

  it("convertit les secondes en millisecondes", async () => {
    expect(await retryAfterMs({ "retry-after": "7" })).toBe(7_000);
  });

  it("plafonne un délai énorme au plafond du domaine", async () => {
    expect(await retryAfterMs({ "retry-after": "999999999999" })).toBe(LLM_MAX_RETRY_AFTER_MS);
  });

  it.each(["", "abc", "-3", "1.5", "Wed, 21 Oct 2026 07:28:00 GMT", "7 secondes", "1e3"])(
    "valeur invalide %j -> 0",
    async (value) => {
      expect(await retryAfterMs({ "retry-after": value })).toBe(0);
    },
  );

  it("en-tête absent -> 0", async () => {
    expect(await retryAfterMs({})).toBe(0);
  });

  it("aucun retry automatique : un 429 n'appelle l'API qu'une fois", async () => {
    const { transport } = await failWith(rate, { "retry-after": "0" });
    expect(transport.calls()).toBe(1);
  });
});

describe("aucun retry sur les erreurs serveur", () => {
  it.each([500, 529])("un %i = un seul appel", async (status) => {
    const { transport } = await failWith({
      label: String(status),
      status,
      expected: LlmProviderUnavailableError,
    });
    expect(transport.calls()).toBe(1);
  });
});

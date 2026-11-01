import { LlmAbortedError, LlmProviderUnavailableError, LlmTimeoutError } from "@koklo/domain";
import { describe, expect, it } from "vitest";
import { bench, KEY, makeRequest, rejection } from "./support/harness.ts";

const tick = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const budgetWith = (timeoutMs: number) => ({
  maxOutputTokens: 1_000,
  timeoutMs,
  maxPromptChars: 10_000,
  maxCostMicroUsd: 5_000_000,
});

const waitForCall = async (transport: { calls(): number }) => {
  for (let i = 0; i < 200 && transport.calls() === 0; i += 1) {
    await tick(2);
  }
};

describe("annulation et délai", () => {
  it("annulation par l'appelant pendant l'appel : LlmAbortedError, requête interrompue", async () => {
    const { transport, provider } = bench();
    transport.enqueue({ kind: "hang" });
    const controller = new AbortController();
    const pending = rejection(provider.complete(makeRequest({ signal: controller.signal })));
    await waitForCall(transport);
    controller.abort();
    expect(await pending).toBeInstanceOf(LlmAbortedError);
    expect(transport.abortedCalls()).toBe(1);
    expect(transport.requests[0]?.signal?.aborted).toBe(true);
  });

  it("une annulation de l'appelant avec une raison TimeoutError reste une annulation", async () => {
    const { transport, provider } = bench();
    transport.enqueue({ kind: "hang" });
    const controller = new AbortController();
    const pending = rejection(provider.complete(makeRequest({ signal: controller.signal })));
    await waitForCall(transport);
    controller.abort(new DOMException("délai de l'appelant", "TimeoutError"));
    expect(await pending).toBeInstanceOf(LlmAbortedError);
  });

  it("signal déjà annulé : LlmAbortedError sans appel", async () => {
    const { transport, provider } = bench();
    const controller = new AbortController();
    controller.abort();
    const error = await rejection(provider.complete(makeRequest({ signal: controller.signal })));
    expect(error).toBeInstanceOf(LlmAbortedError);
    expect(transport.calls()).toBe(0);
  });

  it("délai du budget dépassé : LlmTimeoutError, requête interrompue", async () => {
    const { transport, provider } = bench();
    transport.enqueue({ kind: "hang" });
    const started = Date.now();
    const error = await rejection(provider.complete(makeRequest({ budget: budgetWith(30) })));
    expect(error).toBeInstanceOf(LlmTimeoutError);
    expect(Date.now() - started).toBeLessThan(3_000);
    expect(transport.abortedCalls()).toBe(1);
  });

  it("délai ET signal fournis : le délai donne LlmTimeoutError, pas LlmAbortedError", async () => {
    const { transport, provider } = bench();
    transport.enqueue({ kind: "hang" });
    const controller = new AbortController();
    const request = makeRequest({ budget: budgetWith(30), signal: controller.signal });
    expect(await rejection(provider.complete(request))).toBeInstanceOf(LlmTimeoutError);
  });

  it("le transport lève une TimeoutError : LlmTimeoutError", async () => {
    const { transport, provider } = bench();
    transport.enqueue({ kind: "timeout" });
    expect(await rejection(provider.complete(makeRequest()))).toBeInstanceOf(LlmTimeoutError);
  });

  it("réseau coupé : fournisseur indisponible, la cause réseau n'est pas reprise", async () => {
    const { transport, provider } = bench();
    transport.enqueue({ kind: "network-error", detail: `ECONNRESET ${KEY}` });
    const error = await rejection(provider.complete(makeRequest()));
    expect(error).toBeInstanceOf(LlmProviderUnavailableError);
    expect("cause" in error).toBe(false);
  });

  it("n'attend rien après l'appel : le minuteur du délai est libéré", async () => {
    const { transport, provider } = bench();
    transport.enqueue({ kind: "message", text: "ok" });
    await provider.complete(makeRequest({ budget: budgetWith(60_000) }));
    await tick(5);
    expect(transport.abortedCalls()).toBe(0);
  });
});

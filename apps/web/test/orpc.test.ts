import { afterEach, describe, expect, it, vi } from "vitest";
import { orpc } from "../src/lib/orpc.ts";

afterEach(() => vi.unstubAllGlobals());

describe("client oRPC", () => {
  it("envoie project.list vers /api/orpc sur l'origine courante", async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const options = orpc.project.list.queryOptions();
    // biome-ignore lint/suspicious/noExplicitAny: contexte de requête minimal pour l'appel direct
    await (options.queryFn as any)({ signal: new AbortController().signal });

    const input = fetchMock.mock.calls[0]?.[0];
    const url = new URL(input instanceof Request ? input.url : String(input));
    expect(url.origin).toBe(window.location.origin);
    expect(url.pathname.startsWith("/api/orpc")).toBe(true);
  });
});

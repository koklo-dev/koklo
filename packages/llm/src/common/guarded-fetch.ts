import { boundedResponse } from "./bounded-body.ts";
import type { ErrorContext } from "./diagnostic.ts";
import type { FetchLike } from "./fetch-like.ts";

const urlOf = (input: Parameters<typeof fetch>[0]): string =>
  typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

/**
 * `fetch` donné au SDK : jamais de redirection, corps de réponse plafonné. `inner` est lu à chaque
 * appel (`globalThis.fetch` par défaut), pour que le transport simulé des tests s'y substitue.
 */
export const guardedFetch =
  (inner: FetchLike | undefined, context: ErrorContext): typeof fetch =>
  async (input, init) => {
    const send = inner ?? (globalThis.fetch as FetchLike);
    const response = await send(urlOf(input), { ...init, redirect: "error" });
    return boundedResponse(response, context);
  };

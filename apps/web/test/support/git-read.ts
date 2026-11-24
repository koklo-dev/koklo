import type { Mock } from "vitest";

/** TK-114f lot B : quota GitHub de l'installation épuisé (`PROVIDER_RATE_LIMITED`, 30 min). */
export const RATE_LIMITED = Object.assign(new Error("quota"), {
  code: "PROVIDER_RATE_LIMITED",
  data: { retryAfterMs: 1_800_000 },
});

export const RATE_LIMITED_TEXT = "GitHub limite les lectures, réessayez dans 30 min.";

/** La première requête qui vérifie `match` échoue avec `error` ; les suivantes reprennent l'implémentation servie. */
export function rejectOnce(
  mock: Mock,
  match: (input: unknown) => boolean = () => true,
  error: unknown = RATE_LIMITED,
): void {
  const served = mock.getMockImplementation();
  let rejected = false;
  mock.mockImplementation(async (...args: unknown[]) => {
    if (!rejected && match(args[0])) {
      rejected = true;
      throw error;
    }
    return served?.(...args);
  });
}

/** Cible de `spec.architecture.source` : `{ target: { kind }, format }`. */
export function sourceOf(input: unknown): { kind?: string; format?: string } {
  const { target, format } = (input ?? {}) as { target?: { kind?: string }; format?: string };
  return { kind: target?.kind, format };
}

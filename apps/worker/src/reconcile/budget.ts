import type { GitAuth, GitProvider } from "@koklo/domain";

/** Le budget d'appels du run est épuisé : la passe s'arrête, le prochain run reprend. */
export class ProviderBudgetExhausted extends Error {
  constructor() {
    super("provider call budget exhausted");
    this.name = "ProviderBudgetExhausted";
  }
}

/**
 * Enveloppe d'un fournisseur pour un run : chaque appel réel consomme le budget (au-delà de `cap`,
 * `ProviderBudgetExhausted`) et l'authentification est faite une seule fois par installation.
 */
export function budgetedProvider(provider: GitProvider, cap: number): GitProvider {
  let used = 0;
  const auths = new Map<string, Promise<GitAuth>>();
  const spend = () => {
    if (used >= cap) throw new ProviderBudgetExhausted();
    used++;
  };
  return new Proxy(provider, {
    get(target, property) {
      const member = Reflect.get(target, property, target);
      if (typeof member !== "function") return member;
      if (property === "authenticate") {
        return (request: Parameters<GitProvider["authenticate"]>[0]) => {
          const key = request.installation.id;
          const cached = request.user === undefined ? auths.get(key) : undefined;
          if (cached) return cached;
          spend();
          const pending: Promise<GitAuth> = member.call(target, request);
          if (request.user === undefined) {
            auths.set(key, pending);
            pending.catch(() => auths.delete(key));
          }
          return pending;
        };
      }
      return (...args: unknown[]) => {
        spend();
        return member.apply(target, args);
      };
    },
  });
}

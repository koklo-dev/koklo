import { rateLimited } from "./ai-errors.ts";

/**
 * Sémaphore par organisation et par processus : au plus `limit` appels simultanés. Un appel de trop
 * est refusé tout de suite (429, 1 s), sans file d'attente. La place est rendue par la fonction
 * rendue à l'acquisition, dans tous les cas (succès, échec, sortie invalide, exception).
 */
export class ConcurrencyGate {
  readonly #active = new Map<string, number>();

  constructor(private readonly limit: number) {}

  acquire(organizationId: string): () => void {
    const active = this.#active.get(organizationId) ?? 0;
    if (active >= this.limit) throw rateLimited(1);
    this.#active.set(organizationId, active + 1);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const left = (this.#active.get(organizationId) ?? 1) - 1;
      if (left <= 0) this.#active.delete(organizationId);
      else this.#active.set(organizationId, left);
    };
  }
}

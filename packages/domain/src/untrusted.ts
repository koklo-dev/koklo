import { InvalidUntrustedOriginError } from "./llm-errors.ts";

/** Origines fermées d'une donnée non fiable (TK-50a). */
export const UNTRUSTED_ORIGINS = [
  "spec-file",
  "client-suggestion",
  "ticket-comment",
  "issue",
  "pull-request",
  "git-content",
  "user-input",
  "brief",
  "model-output",
] as const;

export type UntrustedOrigin = (typeof UNTRUSTED_ORIGINS)[number];

const isOrigin = (origin: unknown): origin is UntrustedOrigin =>
  (UNTRUSTED_ORIGINS as readonly unknown[]).includes(origin);

/** Garde publique de la liste fermée (revalidée par `framePrompt`). */
export const isUntrustedOrigin = (_value: unknown): _value is UntrustedOrigin => {
  throw new Error("non implémenté");
};

const MASK = (origin: string): string => `[untrusted:${origin}]`;
const INSPECT = Symbol.for("nodejs.util.inspect.custom");

/**
 * Donnée non fiable immuable : le contenu est privé et ne se laisse pas interpoler
 * (gabarit, `String`, JSON, `util.inspect` rendent `[untrusted:<origine>]`).
 */
export class Untrusted {
  readonly origin: UntrustedOrigin;
  readonly #value: string;

  constructor(origin: UntrustedOrigin, value: string) {
    if (!isOrigin(origin)) {
      throw new InvalidUntrustedOriginError(origin);
    }
    this.origin = origin;
    this.#value = value;
    Object.freeze(this);
  }

  toString(): string {
    return MASK(this.origin);
  }

  toJSON(): string {
    return MASK(this.origin);
  }

  [INSPECT](): string {
    return MASK(this.origin);
  }

  /** Réservé au cadrage de prompt : passer par `revealUntrusted`. */
  static reveal(untrusted: Untrusted): string {
    return untrusted.#value;
  }
}

export const revealUntrusted = (untrusted: Untrusted): string => Untrusted.reveal(untrusted);

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

/** Donnée non fiable immuable ; ne se laisse pas interpoler (squelette Red). */
export class Untrusted {
  readonly origin: UntrustedOrigin;
  readonly #value: string;
  constructor(origin: UntrustedOrigin, value: string) {
    void InvalidUntrustedOriginError;
    void origin;
    void value;
    throw new Error("non implémenté");
  }
  /** Réservé au cadrage de prompt. */
  static reveal(untrusted: Untrusted): string {
    void untrusted.#value;
    throw new Error("non implémenté");
  }
}

export const revealUntrusted = (untrusted: Untrusted): string => Untrusted.reveal(untrusted);

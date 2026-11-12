export type LlmCredentialUnavailableReason =
  | "missing"
  | "invalidated"
  | "undecryptable"
  | "no-encryption-key";

/** `resolve` ne peut pas rendre de clé ; ne porte ni clé ni organisation. */
export class LlmCredentialUnavailableError extends Error {
  readonly reason: LlmCredentialUnavailableReason;
  constructor(reason: LlmCredentialUnavailableReason) {
    super(`Clé de fournisseur LLM indisponible (${reason})`);
    this.name = "LlmCredentialUnavailableError";
    this.reason = reason;
  }
}

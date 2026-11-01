import { InvalidLlmCredentialError } from "./llm-errors.ts";

/** Longueur maximale d'une clé acceptée. */
export const LLM_CREDENTIAL_MAX_LENGTH = 512;

const REDACTED = "[redacted]";
const INSPECT = Symbol.for("nodejs.util.inspect.custom");
/** Jeton de module : seule `llmCredential` peut construire une clé. */
const TOKEN = Symbol("llm-credential");

const hasControlCharacter = (text: string): boolean => {
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) {
      return true;
    }
  }
  return false;
};

/**
 * Clé BYOK opaque : jamais lisible sauf par `revealLlmCredential`. Le secret est un champ privé,
 * l'objet est gelé et sans propriété propre ; tout rendu donne `[redacted]`.
 */
export class LlmCredential {
  readonly #secret: string;

  private constructor(token: symbol, secret: string) {
    if (token !== TOKEN) {
      throw new TypeError("LlmCredential ne se construit que par llmCredential");
    }
    this.#secret = secret;
    Object.freeze(this);
  }

  toString(): string {
    return REDACTED;
  }

  toJSON(): string {
    return REDACTED;
  }

  [Symbol.toPrimitive](): string {
    return REDACTED;
  }

  [INSPECT](): string {
    return REDACTED;
  }

  static is(value: unknown): value is LlmCredential {
    return typeof value === "object" && value !== null && #secret in value;
  }

  static reveal(credential: LlmCredential): string {
    return credential.#secret;
  }
}

const build = LlmCredential as unknown as new (token: symbol, secret: string) => LlmCredential;

/** Enveloppe une clé après validation ; l'erreur ne reprend jamais la valeur. */
export const llmCredential = (secret: string): LlmCredential => {
  if (typeof secret !== "string") {
    throw new InvalidLlmCredentialError("not-a-string");
  }
  if (secret.trim() === "") {
    throw new InvalidLlmCredentialError("empty");
  }
  if (secret.length > LLM_CREDENTIAL_MAX_LENGTH) {
    throw new InvalidLlmCredentialError("too-long");
  }
  if (hasControlCharacter(secret)) {
    throw new InvalidLlmCredentialError("control-characters");
  }
  return new build(TOKEN, secret);
};

export const isLlmCredential = (value: unknown): value is LlmCredential => LlmCredential.is(value);

/** Fonction de dernière minute, réservée à l'adaptateur. */
export const revealLlmCredential = (credential: LlmCredential): string =>
  LlmCredential.reveal(credential);

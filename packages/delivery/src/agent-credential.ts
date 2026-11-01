/** Clé d'agent opaque et optionnelle : `[redacted]` partout, révélée seulement par l'adaptateur. */
import { InvalidAgentCredentialError } from "./agent-errors.ts";

/** Longueur maximale d'une clé acceptée. */
export const AGENT_CREDENTIAL_MAX_LENGTH = 512;

const REDACTED = "[redacted]";
const INSPECT = Symbol.for("nodejs.util.inspect.custom");
/** Jeton de module : seule `agentCredential` peut construire une clé. */
const TOKEN = Symbol("agent-credential");

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
 * Clé opaque : jamais lisible sauf par `revealAgentCredential`. Le secret est un champ privé,
 * l'objet est gelé et sans propriété propre ; tout rendu donne `[redacted]`.
 */
export class AgentCredential {
  readonly #secret: string;

  private constructor(token: symbol, secret: string) {
    if (token !== TOKEN) {
      throw new TypeError("AgentCredential ne se construit que par agentCredential");
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

  static is(value: unknown): value is AgentCredential {
    return typeof value === "object" && value !== null && #secret in value;
  }

  static reveal(credential: AgentCredential): string {
    return credential.#secret;
  }
}

const build = AgentCredential as unknown as new (token: symbol, secret: string) => AgentCredential;

/** Enveloppe une clé après validation ; l'erreur ne reprend jamais la valeur. */
export const agentCredential = (secret: string): AgentCredential => {
  if (typeof secret !== "string") {
    throw new InvalidAgentCredentialError("not-a-string");
  }
  if (secret.trim() === "") {
    throw new InvalidAgentCredentialError("empty");
  }
  if (secret.length > AGENT_CREDENTIAL_MAX_LENGTH) {
    throw new InvalidAgentCredentialError("too-long");
  }
  if (hasControlCharacter(secret)) {
    throw new InvalidAgentCredentialError("control-characters");
  }
  return new build(TOKEN, secret);
};

export const isAgentCredential = (value: unknown): value is AgentCredential =>
  AgentCredential.is(value);

/** Réservé à l'adaptateur qui transmet la clé au processus. */
export const revealAgentCredential = (credential: AgentCredential): string =>
  AgentCredential.reveal(credential);

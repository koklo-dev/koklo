import { randomBytes } from "node:crypto";

/**
 * Source du nonce de `framePrompt` (le domaine n'a ni aléa ni horloge). Production : 48 caractères
 * hexadécimaux issus de `randomBytes(24)`, un nonce NEUF à chaque appel de `next()`, jamais
 * journalisé. Les tests injectent une source déterministe par `overrideProvider(NONCE_SOURCE)`.
 */
export const NONCE_SOURCE = Symbol("NONCE_SOURCE");

export interface NonceSource {
  next(): string;
}

const NONCE_BYTES = 24;

export const randomNonceSource: NonceSource = {
  next(): string {
    return randomBytes(NONCE_BYTES).toString("hex");
  },
};

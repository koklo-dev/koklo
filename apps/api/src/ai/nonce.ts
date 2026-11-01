/**
 * Source du nonce de `framePrompt` (le domaine n'a ni aléa ni horloge). Production : 48 caractères
 * hexadécimaux issus de `randomBytes(24)`, un nonce NEUF à chaque appel de `next()`, jamais
 * journalisé. Les tests injectent une source déterministe par `overrideProvider(NONCE_SOURCE)`.
 */
export const NONCE_SOURCE = Symbol("NONCE_SOURCE");

export interface NonceSource {
  next(): string;
}

/** Squelette TK-54b (étape RED) : l'implémentation arrive au Green. */
export const randomNonceSource: NonceSource = {
  next(): string {
    throw new Error("TK-54b : randomNonceSource n'est pas implémenté");
  },
};

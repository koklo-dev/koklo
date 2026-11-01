/** Longueur maximale d'une clé acceptée. */
export const LLM_CREDENTIAL_MAX_LENGTH = 512;

/** Clé BYOK opaque : jamais lisible sauf par `revealLlmCredential`. */
export class LlmCredential {
  declare private readonly brand: "llm-credential";
  private constructor() {
    throw new Error("non implémenté");
  }
}

export const llmCredential = (_secret: string): LlmCredential => {
  throw new Error("non implémenté");
};

export const isLlmCredential = (_value: unknown): _value is LlmCredential => {
  throw new Error("non implémenté");
};

/** Fonction de dernière minute, réservée à l'adaptateur. */
export const revealLlmCredential = (_credential: LlmCredential): string => {
  throw new Error("non implémenté");
};

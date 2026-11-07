import type { LlmProviderId } from "@koklo/domain";
import type { LlmCredentialResolver, ResolvedLlmCredential } from "./llm-credential.resolver.ts";

/**
 * Lecture de la clé d'UN fournisseur nommé, pour `llmCredential.verify` seulement (le fournisseur vient de
 * l'URL, il n'y a pas d'usage à router). Avec la source de clés du moteur, c'est l'autre porte vers le résolveur :
 * la liste blanche est testée (`ai-engine-wiring.test.ts`).
 */
export class CredentialProbe {
  constructor(private readonly resolver: LlmCredentialResolver) {}

  open(organizationId: string, provider: LlmProviderId): Promise<ResolvedLlmCredential> {
    return this.resolver.resolve(organizationId, provider);
  }
}

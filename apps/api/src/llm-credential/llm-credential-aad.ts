import type { LlmProviderId } from "@koklo/domain";

/**
 * Données associées du chiffrement d'une clé BYOK : `llm:v1:<organization_id>:<provider>`. Dérivées à
 * chaque appel, jamais stockées : une ligne copiée vers une autre organisation ou un autre
 * fournisseur devient illisible.
 */
export function llmCredentialAad(organizationId: string, provider: LlmProviderId): string {
  return `llm:v1:${organizationId}:${provider}`;
}

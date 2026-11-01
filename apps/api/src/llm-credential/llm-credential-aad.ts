import type { LlmProviderId } from "@koklo/domain";

/** Squelette du Red (TK-52a) : `llm:v1:<organization_id>:<provider>`. */
export function llmCredentialAad(_organizationId: string, _provider: LlmProviderId): string {
  throw new Error("not implemented");
}

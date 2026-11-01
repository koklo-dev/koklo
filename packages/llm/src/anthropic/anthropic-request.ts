import type { LlmRequest } from "@koklo/domain";
import { ANTHROPIC_API_VERSION } from "./constants.ts";

/** Corps de `POST /v1/messages` : ni outils, ni flux, ni réflexion, ni métadonnée. */
export const buildBody = (request: LlmRequest): string => {
  const { model, prompt, output, budget, temperature } = request;
  return JSON.stringify({
    model,
    max_tokens: budget.maxOutputTokens,
    system: prompt.system,
    messages: [{ role: "user", content: prompt.user }],
    ...(temperature === undefined ? {} : { temperature }),
    ...(output.kind === "json"
      ? { output_config: { format: { type: "json_schema", schema: output.schema } } }
      : {}),
  });
};

/** En-têtes exacts de l'appel ; la clé n'est lue qu'ici, au dernier moment. */
export const buildHeaders = (apiKey: string): Record<string, string> => ({
  "anthropic-version": ANTHROPIC_API_VERSION,
  "content-type": "application/json",
  "x-api-key": apiKey,
});

import { ANTHROPIC_MAX_RESPONSE_BYTES } from "./constants.ts";
import { unavailable } from "./diagnostic.ts";

const ignore = (): void => undefined;

/** Libère la connexion d'un corps dont on n'a pas besoin. */
export const discardBody = async (response: Response): Promise<void> => {
  await response.body?.cancel().catch(ignore);
};

const announcedTooLarge = (response: Response): boolean => {
  const announced = Number(response.headers.get("content-length"));
  return Number.isFinite(announced) && announced > ANTHROPIC_MAX_RESPONSE_BYTES;
};

/**
 * Lit le corps en texte, plafonné à `ANTHROPIC_MAX_RESPONSE_BYTES` : une taille annoncée trop grande
 * est refusée sans lecture, un flux plus long est interrompu au plafond.
 */
export const readBoundedText = async (response: Response): Promise<string> => {
  if (announcedTooLarge(response)) {
    await discardBody(response);
    throw unavailable(response.status);
  }
  const reader = response.body?.getReader();
  if (reader === undefined) {
    return "";
  }
  const decoder = new TextDecoder();
  let text = "";
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      return text + decoder.decode();
    }
    total += value.byteLength;
    if (total > ANTHROPIC_MAX_RESPONSE_BYTES) {
      await reader.cancel().catch(ignore);
      throw unavailable(response.status);
    }
    text += decoder.decode(value, { stream: true });
  }
};

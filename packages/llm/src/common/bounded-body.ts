import { MAX_RESPONSE_BYTES } from "./constants.ts";
import { type ErrorContext, unavailable } from "./diagnostic.ts";

const ignore = (): void => undefined;

const announcedTooLarge = (headers: Headers): boolean => {
  const announced = Number(headers.get("content-length"));
  return Number.isFinite(announced) && announced > MAX_RESPONSE_BYTES;
};

/** Flux qui s'interrompt (erreur typée) dès que le plafond d'octets est dépassé. */
const capped = (
  body: ReadableStream<Uint8Array>,
  fail: () => Error,
): ReadableStream<Uint8Array> => {
  const reader = body.getReader();
  let total = 0;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        controller.close();
        return;
      }
      total += value.byteLength;
      if (total > MAX_RESPONSE_BYTES) {
        await reader.cancel().catch(ignore);
        controller.error(fail());
        return;
      }
      controller.enqueue(value);
    },
    cancel: (reason) => reader.cancel(reason).catch(ignore),
  });
};

/**
 * Réponse dont le corps est plafonné à `MAX_RESPONSE_BYTES` : une taille annoncée trop grande est
 * refusée sans lecture, un flux plus long est interrompu au plafond (succès comme erreur).
 */
export const boundedResponse = async (
  response: Response,
  context: ErrorContext,
): Promise<Response> => {
  if (announcedTooLarge(response.headers)) {
    await response.body?.cancel().catch(ignore);
    throw unavailable(context, response.status);
  }
  if (response.body === null) {
    return response;
  }
  return new Response(
    capped(response.body, () => unavailable(context, response.status)),
    { status: response.status, statusText: response.statusText, headers: response.headers },
  );
};

import { WEBHOOK_MAX_BODY_BYTES } from "@koklo/domain";
import express, {
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
} from "express";

/** Chemin (hors OpenAPI) où GitHub poste ses livraisons ; tolère la casse et une barre finale comme le routeur. */
const WEBHOOK_PATH_PATTERN = /^\/api\/webhooks\/github\/?$/i;
const JSON_CONTENT_TYPE = /^application\/json\s*(?:;|$)/i;

function reject(response: Response, status: number, error: string): void {
  // Le corps n'est pas lu : fermer la connexion évite de laisser un flux inutile ouvert.
  response.set("Connection", "close").status(status).json({ error });
}

function statusOfParserError(error: unknown): number {
  const status = (error as { status?: unknown } | null)?.status;
  return status === 413 || status === 415 ? status : 400;
}

/**
 * Parseur de corps de `POST /api/webhooks/github`, monté AVANT les parseurs globaux de Nest (100 ko).
 * Les octets exacts reçus sont rendus dans `request.body` (`Buffer`) : la signature se calcule dessus,
 * jamais sur un JSON re-sérialisé. Ordre, du moins cher au plus cher, sans rien lire avant la fin :
 * secret absent (503), `Content-Length` > 5 Mio (413), type autre que `application/json` (415), puis
 * lecture plafonnée à 5 Mio (413 si l'en-tête mentait). Les autres routes passent sans être touchées.
 */
export function webhookBodyParser(secret: string | undefined): RequestHandler {
  const readRaw = express.raw({ type: () => true, limit: WEBHOOK_MAX_BODY_BYTES, inflate: false });
  return (request: Request, response: Response, next: NextFunction): void => {
    if (request.method !== "POST" || !WEBHOOK_PATH_PATTERN.test(request.path)) {
      next();
      return;
    }
    if (secret === undefined || secret === "") {
      reject(response, 503, "webhook_not_configured");
      return;
    }
    if (Number(request.headers["content-length"]) > WEBHOOK_MAX_BODY_BYTES) {
      reject(response, 413, "payload_too_large");
      return;
    }
    if (!JSON_CONTENT_TYPE.test(request.headers["content-type"] ?? "")) {
      reject(response, 415, "unsupported_media_type");
      return;
    }
    readRaw(request, response, (error?: unknown) => {
      if (error === undefined) {
        next();
        return;
      }
      const status = statusOfParserError(error);
      reject(response, status, status === 413 ? "payload_too_large" : "invalid_body");
    });
  };
}

interface RouterLike {
  stack: unknown[];
}

/**
 * Monte `handler` en tête de la pile Express. Nest enregistre ses parseurs JSON/URL avant le code des
 * modules et le test/`main.ts` ne passent pas d'option : sans cela, la limite de 100 ko s'appliquerait
 * (413) avant ce chemin. Le reste de l'application garde ses parseurs et leur limite.
 */
export function mountFirst(
  app: { use(handler: RequestHandler): unknown; router: unknown },
  handler: RequestHandler,
): void {
  app.use(handler);
  const { stack } = app.router as RouterLike;
  const layer = stack.pop();
  if (layer !== undefined) stack.unshift(layer);
}

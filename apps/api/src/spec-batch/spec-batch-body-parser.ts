import { SPEC_BATCH_MAX_BODY_BYTES } from "@koklo/contract";
import express, {
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
} from "express";

/**
 * Plafond du corps : `SPEC_BATCH_MAX_BODY_BYTES` (contrat, 4 Mio), pour 200 opérations au plus avec description et
 * critères. Les 100 ko par défaut d'Express refusaient (413) un enregistrement de 149 propositions de l'agent, sans que
 * la requête atteigne l'application ni le journal.
 */

const SPEC_BATCH_PATH = /^\/projects\/[^/]+\/spec\/batches\/?$/i;

/**
 * Parseur JSON de cette seule route, monté avant les parseurs globaux de Nest (`mountFirst`) : le corps est lu ici
 * avec un plafond de 4 Mio, et le parseur global, qui voit `request._body`, ne le relit pas. Les autres routes gardent
 * la limite de 100 ko.
 */
export function specBatchBodyParser(): RequestHandler {
  const readJson = express.json({ limit: SPEC_BATCH_MAX_BODY_BYTES });
  return (request: Request, response: Response, next: NextFunction): void => {
    if (request.method !== "POST" || !SPEC_BATCH_PATH.test(request.path)) {
      next();
      return;
    }
    readJson(request, response, next);
  };
}

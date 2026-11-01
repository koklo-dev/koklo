import {
  type ArgumentsHost,
  BadRequestException,
  Catch,
  type ExceptionFilter,
} from "@nestjs/common";
import { ORPCError } from "@orpc/server";
import type { Response } from "express";
import { ERROR_STATUS_MAP } from "./error-status.ts";

/**
 * Le message d'une erreur du parseur JSON (« Unexpected token ... is not valid JSON ») cite un
 * extrait du corps : sur `PUT /llm-credentials/{provider}`, un fragment de la clé. Nest convertit ce
 * `SyntaxError` en `BadRequestException(message)` avant les filtres. Le code de l'application ne lève
 * jamais de `BadRequestException` (ses refus sont des `ORPCError`) : en recevoir une ici ne peut venir
 * que du parseur. Le filtre rend une erreur générique au format typé du contrat ; ni le message, ni la
 * cause, ni le corps ne sont repris, journalisés ou capturés. Les refus sans extrait du parseur (413
 * trop gros, 415 encodage) gardent le traitement par défaut de Nest.
 */
@Catch(BadRequestException, SyntaxError)
export class BodyParserErrorFilter implements ExceptionFilter {
  catch(_exception: unknown, host: ArgumentsHost): void {
    const status = ERROR_STATUS_MAP.BAD_REQUEST;
    const error = new ORPCError("BAD_REQUEST", { message: "Corps de requête invalide" });
    host
      .switchToHttp()
      .getResponse<Response>()
      .status(status)
      .json({ ...error.toJSON(), status });
  }
}

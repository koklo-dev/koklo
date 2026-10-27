import { type ArgumentsHost, Catch, type ExceptionFilter } from "@nestjs/common";
import { ORPCError } from "@orpc/server";
import type { Response } from "express";
import { ERROR_STATUS_MAP } from "../error-status.ts";

const STATUS_BY_CODE: Record<string, number | undefined> = ERROR_STATUS_MAP;

/**
 * Un garde Nest s'exécute avant le handler oRPC : son `ORPCError` n'est pas sérialisé par oRPC.
 * Ce filtre le rend au format typé du contrat (`{ code, status, message, ... }`), avec le statut
 * HTTP de la même table que celle d'`ORPCModule` (`app.module.ts`).
 */
@Catch(ORPCError)
export class OrpcErrorFilter implements ExceptionFilter<ORPCError<string, unknown>> {
  catch(error: ORPCError<string, unknown>, host: ArgumentsHost): void {
    const status = STATUS_BY_CODE[error.code] ?? 500;
    host
      .switchToHttp()
      .getResponse<Response>()
      .status(status)
      .json({ ...error.toJSON(), status });
  }
}

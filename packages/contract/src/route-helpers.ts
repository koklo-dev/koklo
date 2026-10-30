import { oc } from "@orpc/contract";
import { openapi } from "@orpc/openapi";
import { authErrors, internalError, notFoundError, unauthorizedError } from "./errors.ts";

/** Lecture ouverte à tous les rôles : pas de FORBIDDEN, la ressource d'un autre projet est NOT_FOUND. */
export const readErrors = { ...internalError, ...unauthorizedError } as const;
export const readOneErrors = { ...readErrors, ...notFoundError } as const;
/** Écriture réservée à certains rôles du CDC §14 (la matrice est vérifiée côté API). */
export const writeErrors = { ...internalError, ...authErrors } as const;
export const writeOneErrors = { ...writeErrors, ...notFoundError } as const;

/** Point d'entrée de toute procédure : fixe la méthode et le chemin OpenAPI explicites (CT-4). */
export const route = (method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE", path: `/${string}`) =>
  oc.meta(openapi({ method, path }));

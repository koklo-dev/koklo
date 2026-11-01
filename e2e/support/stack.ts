/**
 * Support e2e (pas du code de production) : adresses de la pile lancée par `pnpm e2e`.
 * Le web relaie `/api/orpc` et `/api/webhooks/github` (chemin de production) ; `/health` n'est
 * joignable que sur l'API.
 */
export const WEBHOOK_PATH = "/api/webhooks/github";
export const ORPC_PATH = "/api/orpc";

export function apiUrl(): string {
  return process.env.E2E_API_URL ?? `http://127.0.0.1:${process.env.E2E_API_PORT ?? "3201"}`;
}

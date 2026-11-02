import { type NextRequest, NextResponse } from "next/server";
import { guardedPathFor, resolveAccess } from "./lib/auth-guard.ts";
import { loginPathFor } from "./lib/next-path.ts";
import { ORPC_PREFIX } from "./lib/orpc-prefix.ts";
import { readRuntimeConfig } from "./lib/runtime-config.ts";
import { readSession } from "./lib/session.ts";

const WEBHOOK_PATH = "/api/webhooks/github";
/** Callback GitHub (Callback URL de l'App) : chemin exact, ni `/installed` ni sous-chemin. */
const GITHUB_CALLBACK_PATH = "/api/github/callback";

/**
 * Proxy exécuté à chaque requête (donc config lue à l'exécution) :
 * - `/api/auth/*` et `/api/orpc/*` sont relayés vers `API_INTERNAL_URL` (même origine pour le navigateur) ;
 * - `/api/webhooks/github` est relayé tel quel, sans session (livraisons signées de GitHub) ;
 * - `/api/github/callback` est relayé tel quel avec le cookie de session, sans lecture de session ici :
 *   l'API arbitre (session absente ou état invalide = `/github?result=invalid_state`, jamais `/login`) ;
 * - `/login`, `/projects`, `/projects/<id>/features`, `/projects/<id>/framing`, `/kanban`, `/members`, `/github` et `/organizations` sont gardés
 *   selon la session et l'organisation active ;
 * - `/accept-invitation/<id>` exige une session (sinon `/login?next=…`) mais jamais d'organisation active,
 *   et n'est jamais mis en cache.
 */
export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { apiUrl } = readRuntimeConfig(process.env);
  const { pathname, search } = request.nextUrl;

  if (pathname === WEBHOOK_PATH) {
    // GitHub poste sans cookie : la signature est l'authentification, vérifiée par l'API sur les octets bruts.
    return NextResponse.rewrite(new URL(`${pathname}${search}`, apiUrl));
  }
  if (pathname === GITHUB_CALLBACK_PATH) {
    return NextResponse.rewrite(new URL(`${pathname}${search}`, apiUrl));
  }
  if (pathname.startsWith("/api/auth/")) {
    return NextResponse.rewrite(new URL(`${pathname}${search}`, apiUrl));
  }
  if (pathname.startsWith(`${ORPC_PREFIX}/`)) {
    return NextResponse.rewrite(new URL(`${pathname.slice(ORPC_PREFIX.length)}${search}`, apiUrl));
  }

  if (pathname.startsWith("/accept-invitation/")) {
    const { hasSession } = await readSession(apiUrl, request.headers.get("cookie"));
    return noStore(hasSession ? NextResponse.next() : redirectTo(request, loginPathFor(pathname)));
  }

  const path = guardedPathFor(pathname);
  if (!path) return NextResponse.next();
  const target = resolveAccess({
    path,
    ...(await readSession(apiUrl, request.headers.get("cookie"))),
  });
  if (!target) return NextResponse.next();
  return redirectTo(request, target);
}

function redirectTo(request: NextRequest, target: string): NextResponse {
  const destination = request.nextUrl.clone();
  const [pathname = "/", query = ""] = target.split("?");
  destination.pathname = pathname;
  destination.search = query;
  return NextResponse.redirect(destination);
}

function noStore(response: NextResponse): NextResponse {
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export const config = {
  matcher: [
    "/login",
    "/projects",
    "/projects/:projectId/features",
    "/projects/:projectId/framing",
    "/kanban",
    "/members",
    "/github",
    "/organizations",
    "/accept-invitation/:id",
    "/api/auth/:path*",
    "/api/orpc/:path*",
    "/api/webhooks/github",
    "/api/github/callback",
  ],
};

import { type NextRequest, NextResponse } from "next/server";
import { type GuardedPath, resolveAccess } from "./lib/auth-guard.ts";
import { ORPC_PREFIX } from "./lib/orpc-prefix.ts";
import { readRuntimeConfig } from "./lib/runtime-config.ts";
import { readSession } from "./lib/session.ts";

/**
 * Proxy exécuté à chaque requête (donc config lue à l'exécution) :
 * - `/api/auth/*` et `/api/orpc/*` sont relayés vers `API_INTERNAL_URL` (même origine pour le navigateur) ;
 * - `/login`, `/projects`, `/members` et `/organizations` sont gardés selon la session et l'organisation active.
 */
export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { apiUrl } = readRuntimeConfig(process.env);
  const { pathname, search } = request.nextUrl;

  if (pathname.startsWith("/api/auth/")) {
    return NextResponse.rewrite(new URL(`${pathname}${search}`, apiUrl));
  }
  if (pathname.startsWith(`${ORPC_PREFIX}/`)) {
    return NextResponse.rewrite(new URL(`${pathname.slice(ORPC_PREFIX.length)}${search}`, apiUrl));
  }

  const path = pathname as GuardedPath;
  const target = resolveAccess({
    path,
    ...(await readSession(apiUrl, request.headers.get("cookie"))),
  });
  if (!target) return NextResponse.next();
  const destination = request.nextUrl.clone();
  destination.pathname = target;
  destination.search = "";
  return NextResponse.redirect(destination);
}

export const config = {
  matcher: [
    "/login",
    "/projects",
    "/members",
    "/organizations",
    "/api/auth/:path*",
    "/api/orpc/:path*",
  ],
};

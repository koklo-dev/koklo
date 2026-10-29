"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { authClient } from "./auth-client.ts";
import { redirectForError } from "./auth-guard.ts";

/**
 * Sur UNAUTHORIZED, revérifie la session : perdue -> /login, présente -> /organizations (G1,
 * jamais /login quand une session existe). Renvoie true tant que l'erreur est une UNAUTHORIZED.
 */
export function useUnauthorizedRedirect(error: unknown): boolean {
  const router = useRouter();
  const pathname = usePathname();
  const unauthorized = redirectForError(error, { hasSession: true }) !== null;

  useEffect(() => {
    if (!unauthorized) return;
    let current = true;
    authClient
      .getSession()
      .then(({ data }) => {
        const target = redirectForError(error, { hasSession: data !== null });
        if (current && target && target !== pathname) router.replace(target);
      })
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [unauthorized, error, pathname, router]);

  return unauthorized;
}

"use client";

import { useMutation } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { assignLocation, isGithubUrl } from "./github-redirect.ts";
import { describeStartError, START_FAILED, type StartFailure } from "./github-start-error.ts";
import { orpc } from "./orpc.ts";

/** Clé de l'action en cours : « new » pour une nouvelle installation, sinon l'identifiant de la ligne. */
export const NEW_INSTALLATION = "new";

/**
 * Une seule action en vol : le verrou (ref) est posé avant tout rendu, un double clic ne compte qu'une fois.
 * `beforeRedirect` s'exécute juste avant de quitter la page, une fois l'URL de GitHub validée.
 */
export function useStartInstallation(onFailure: (failure: StartFailure) => void) {
  const start = useMutation(orpc.installation.start.mutationOptions());
  const lock = useRef(false);
  const [active, setActive] = useState<string>();

  useEffect(() => {
    const rearm = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      lock.current = false;
      setActive(undefined);
    };
    window.addEventListener("pageshow", rearm);
    return () => window.removeEventListener("pageshow", rearm);
  }, []);

  const run = (installationId?: string, beforeRedirect?: () => void) => {
    if (lock.current) return;
    lock.current = true;
    setActive(installationId ?? NEW_INSTALLATION);
    const fail = (failure: StartFailure) => {
      lock.current = false;
      setActive(undefined);
      onFailure(failure);
    };
    start
      .mutateAsync(installationId ? { installationId } : {})
      .then(({ url }) => {
        // L'URL vient de l'API, jamais construite ici : on ne quitte la page que vers GitHub (https).
        if (!isGithubUrl(url)) return fail(START_FAILED);
        beforeRedirect?.();
        assignLocation(url);
      })
      .catch((error: unknown) => fail(describeStartError(error)));
  };
  return { active, run };
}

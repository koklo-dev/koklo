"use client";

import { useQuery } from "@tanstack/react-query";
import { type RefObject, useEffect, useState } from "react";
import { orpc } from "./orpc.ts";

/** Relecture de `spec.head` tant que la spec se prépare : toutes les 5 s, pendant 2 minutes au plus. */
export const REFRESH_EVERY_MS = 5000;
export const REFRESH_WINDOW_MS = 2 * 60 * 1000;

interface HeadOptions {
  enabled: boolean;
  /** Faux quand `spec.head` vaut `null` mais que l'absence de dépôt de spec est établie : rien à attendre. */
  pollEmpty: RefObject<boolean>;
}

/** La spec se prépare : `building`, ou rien d'indexé alors qu'un dépôt peut exister (ou qu'on ne peut pas le savoir). */
function isWaiting(data: { status: string } | null | undefined, pollEmpty: boolean): boolean {
  return data === null ? pollEmpty : data?.status === "building";
}

/**
 * `spec.head` d'un projet, relu à intervalle borné pendant la préparation. L'onglet masqué suspend la relecture
 * (`refetchIntervalInBackground: false`). `restart()` rouvre la fenêtre de 2 minutes (« Actualiser »).
 */
export function useSpecHead(projectId: string, { enabled, pollEmpty }: HeadOptions) {
  const [run, setRun] = useState(0);
  const [expiredRun, setExpiredRun] = useState<number | null>(null);
  const expired = expiredRun === run;

  const query = useQuery({
    ...orpc.spec.head.queryOptions({ input: { projectId } }),
    enabled,
    refetchIntervalInBackground: false,
    refetchInterval: (current) =>
      isWaiting(current.state.data, pollEmpty.current) && !expired ? REFRESH_EVERY_MS : false,
  });

  const waiting = isWaiting(query.data, pollEmpty.current);
  useEffect(() => {
    if (!waiting) {
      setExpiredRun(null);
      return;
    }
    const timer = setTimeout(() => setExpiredRun(run), REFRESH_WINDOW_MS);
    return () => clearTimeout(timer);
  }, [waiting, run]);

  return { query, expired: waiting && expired, restart: () => setRun((value) => value + 1) };
}

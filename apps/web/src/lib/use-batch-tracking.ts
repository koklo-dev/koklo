"use client";

import type { SpecBatchOutput } from "@koklo/contract";
import { useCallback, useEffect, useRef, useState } from "react";
import { pollDelay, TRACKING_LIMIT_MS } from "./feature-tracking.ts";
import { orpc } from "./orpc.ts";

interface Handlers {
  onBatch: (batch: SpecBatchOutput) => void;
  /** Le suivi s'arrête à 60 s : ce n'est pas une erreur, l'écriture continue sans la page. */
  onSlow: () => void;
  onError: (error: unknown) => void;
}
interface TrackingOptions extends Handlers {
  projectId: string;
  /** Vrai tant que le lot est en file ou en cours d'écriture. */
  active: boolean;
  batchId: string | null;
  /** Première relecture immédiate (reprise au rechargement) au lieu d'attendre 1,5 s. */
  eager: boolean;
}

const TERMINAL = ["committed", "failed", "conflict"];

/** Une fenêtre de suivi : relectures en backoff, suspendues onglet masqué, bornées à 60 s. */
function createPoller(read: () => Promise<SpecBatchOutput>, handlers: () => Handlers) {
  let stopped = false;
  let waiting = false;
  let attempt = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const stop = () => {
    stopped = true;
    clearTimeout(timer);
    clearTimeout(deadline);
    document.removeEventListener("visibilitychange", onVisible);
  };
  const schedule = (delay: number) => {
    timer = setTimeout(() => void tick(), delay);
  };
  const deadline = setTimeout(() => {
    stop();
    handlers().onSlow();
  }, TRACKING_LIMIT_MS);

  async function tick(): Promise<void> {
    if (stopped) return;
    if (document.visibilityState === "hidden") {
      waiting = true;
      return;
    }
    try {
      const batch = await read();
      if (stopped) return;
      handlers().onBatch(batch);
      if (TERMINAL.includes(batch.status)) return stop();
    } catch (error) {
      handlers().onError(error);
    }
    if (stopped) return;
    attempt += 1;
    schedule(pollDelay(attempt));
  }

  function onVisible(): void {
    if (!waiting || document.visibilityState === "hidden") return;
    waiting = false;
    schedule(0);
  }

  document.addEventListener("visibilitychange", onVisible);
  return { start: (eager: boolean) => schedule(eager ? 0 : pollDelay(0)), stop };
}

/**
 * Relit `specBatch.get` en backoff (1,5 s, x1,5, plafonné à 5 s) pendant 60 s au plus, suspendu onglet masqué.
 * Jamais un nouvel envoi. `restart()` ouvre une nouvelle fenêtre bornée avec une relecture immédiate.
 */
export function useBatchTracking(options: TrackingOptions) {
  const { projectId, active, batchId } = options;
  const [run, setRun] = useState(0);
  const latest = useRef(options);
  latest.current = options;
  const restarted = useRef(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `run` ouvre une nouvelle fenêtre (« Vérifier maintenant »)
  useEffect(() => {
    if (!active || !batchId) return;
    const poller = createPoller(
      () => orpc.specBatch.get.call({ projectId, batchId }),
      () => latest.current,
    );
    poller.start(restarted.current || latest.current.eager);
    restarted.current = false;
    return poller.stop;
  }, [active, batchId, projectId, run]);

  return {
    restart: useCallback(() => {
      restarted.current = true;
      setRun((value) => value + 1);
    }, []),
  };
}

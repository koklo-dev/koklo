"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { type AiErrorView, describeAiError, formatRetry } from "./ai-errors.ts";
import { useUnauthorizedRedirect } from "./use-unauthorized-redirect.ts";

/** Palier d'annonce du compte à rebours (S-framing §4.6) : jamais chaque seconde. */
const ANNOUNCE_EVERY_S = 15;
const SETTLE_TURNS = 2;

interface CallState {
  /** Nature de l'appel en cours (`brief`, `propose`) ; `null` au repos. */
  pending: string | null;
  error: AiErrorView | null;
  raw: unknown;
  /** L'attente a été abandonnée : la demande est déjà comptée côté serveur. */
  cancelled: boolean;
}
const IDLE: CallState = { pending: null, error: null, raw: null, cancelled: false };

/** Secondes restantes avant l'échéance et texte à annoncer (palier de 15 s, puis « Vous pouvez réessayer. »). */
function useRetryCountdown(error: AiErrorView | null) {
  const [remaining, setRemaining] = useState<number | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const seconds = error?.retryAfterSeconds ?? null;
  // biome-ignore lint/correctness/useExhaustiveDependencies: un nouvel échec (nouvel objet) relance le compte à rebours
  useEffect(() => {
    if (seconds === null) {
      setRemaining(null);
      setAnnouncement("");
      return;
    }
    const deadline = Date.now() + seconds * 1000;
    let last = Number.POSITIVE_INFINITY;
    const sync = (): number => {
      const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setRemaining(left);
      if (left !== last && (left === 0 || left === seconds || left % ANNOUNCE_EVERY_S === 0)) {
        setAnnouncement(
          left === 0 ? "Vous pouvez réessayer." : `Réessayez dans ${formatRetry(left)}.`,
        );
      }
      last = left;
      return left;
    };
    sync();
    // Chaîne de minuteurs plutôt qu'un intervalle : chaque tour réarme le suivant sur l'horloge courante. Les deux
    // premiers tours sont immédiats : le décompte se recale sur l'horloge réelle avant la cadence d'une seconde.
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let turn = 0;
    const tick = () => {
      if (stopped) return;
      if (sync() > 0) {
        turn += 1;
        timer = setTimeout(tick, turn <= SETTLE_TURNS ? 0 : 1000);
      }
    };
    timer = setTimeout(tick, 0);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [error, seconds]);
  return { remaining, announcement };
}

/** Exécution d'un appel : drapeau d'occupation lisible tout de suite (double clic), génération pour ignorer une réponse tardive. */
function useCallRunner() {
  const [state, setState] = useState<CallState>(IDLE);
  const busy = useRef(false);
  const generation = useRef(0);
  useEffect(
    () => () => {
      generation.current += 1;
    },
    [],
  );

  const run = useCallback(
    <T>(kind: string, call: () => Promise<T>, onDone: (output: T) => void) => {
      if (busy.current) return;
      busy.current = true;
      generation.current += 1;
      const mine = generation.current;
      setState({ ...IDLE, pending: kind });
      call().then(
        (output) => {
          if (mine !== generation.current) return;
          busy.current = false;
          setState(IDLE);
          onDone(output);
        },
        (raw: unknown) => {
          if (mine !== generation.current) return;
          busy.current = false;
          setState({ ...IDLE, error: describeAiError(raw), raw });
        },
      );
    },
    [],
  );

  const cancel = useCallback(() => {
    generation.current += 1;
    busy.current = false;
    setState({ ...IDLE, cancelled: true });
  }, []);

  return { state, run, cancel, clear: () => setState(IDLE) };
}

/**
 * Un seul appel IA à la fois pour la page (S-framing §4.3, §5.1) : annulation de l'attente côté écran, échec
 * traduit en vue d'erreur, compte à rebours de la limite. `UNAUTHORIZED` redirige sans rien afficher et sans
 * toucher au brouillon.
 */
export function useAiCall() {
  const { state, run, cancel, clear } = useCallRunner();
  const unauthorized = useUnauthorizedRedirect(state.raw);
  const countdown = useRetryCountdown(state.error);
  return {
    pending: state.pending,
    cancelled: state.cancelled,
    /** Aucune alerte pendant une redirection (session perdue). */
    error: unauthorized ? null : state.error,
    remaining: countdown.remaining,
    announcement: countdown.announcement,
    /** Compte à rebours en cours : le bouton d'appel reste inactif. */
    waiting: (countdown.remaining ?? 0) > 0,
    run,
    cancel,
    clear,
  };
}

export type AiCall = ReturnType<typeof useAiCall>;

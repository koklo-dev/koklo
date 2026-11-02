"use client";

import type { llmCredentialSetInputSchema } from "@koklo/contract";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type MutableRefObject, useCallback, useMemo, useRef, useState } from "react";
import type { z } from "zod";
import { AI_SETTINGS_LABELS as L, savedAndVerified, verifiedAgain } from "./ai-settings-labels.ts";
import { type Failure, removeFailure, setFailure, verifyFailure } from "./ai-settings-outcomes.ts";
import {
  failurePatch,
  INITIAL_SESSION,
  type SessionState,
  startingPatch,
} from "./ai-settings-session.ts";
import { errorCode } from "./api-error.ts";
import { orpc } from "./orpc.ts";
import { useRetryCountdown } from "./use-ai-call.ts";
import { useUnauthorizedRedirect } from "./use-unauthorized-redirect.ts";

const PROVIDER = "anthropic" as const;
const UNAUTHORIZED = { code: "UNAUTHORIZED" } as const;

export type SetInput = z.output<typeof llmCredentialSetInputSchema>;
/** `invalid` : le serveur refuse la clé (422), l'écran affiche le message générique du champ. */
export type SaveResult = "done" | "invalid";

type Attempt<T> = { ok: true; value: T } | { ok: false; error: unknown };

/**
 * Lance une écriture puis réinitialise la mutation dans tous les cas : les `variables` (la clé) et l'erreur (qui peut
 * répéter la saisie) ne restent ni dans le cache de TanStack ni dans l'observateur.
 */
async function attempt<T>(run: () => Promise<T>, reset: () => void): Promise<Attempt<T>> {
  try {
    return { ok: true, value: await run() };
  } catch (error) {
    return { ok: false, error };
  } finally {
    reset();
  }
}

/** Outils communs aux parcours : état de session, drapeau d'occupation, rechargement de la liste. */
interface Base {
  setState: React.Dispatch<React.SetStateAction<SessionState>>;
  patch: (next: Partial<SessionState>) => void;
  reload: () => void;
  fail: (failure: Failure, closeForm: boolean) => void;
  busy: MutableRefObject<boolean>;
}

function useBase(): Base & { state: SessionState } {
  const client = useQueryClient();
  const [state, setState] = useState<SessionState>(INITIAL_SESSION);
  const busy = useRef(false);
  const patch = useCallback((next: Partial<SessionState>) => {
    setState((current) => ({ ...current, ...next }));
  }, []);
  const reload = useCallback(
    () => void client.invalidateQueries({ queryKey: orpc.llmCredential.key() }),
    [client],
  );
  const fail = useCallback(
    (failure: Failure, closeForm: boolean) => {
      patch(failurePatch(failure, closeForm));
      if (failure.reload) reload();
    },
    [patch, reload],
  );
  return { state, setState, patch, reload, fail, busy };
}

/** Exécute un parcours si aucun autre n'est en vol ; le drapeau est lisible tout de suite (double clic). */
async function exclusive<T>(busy: MutableRefObject<boolean>, run: () => Promise<T>) {
  if (busy.current) return undefined;
  busy.current = true;
  try {
    return await run();
  } finally {
    busy.current = false;
  }
}

/** Vérifie la clé enregistrée ; `saved` : fin du parcours « Enregistrer et vérifier ». */
function useVerifyStep({ patch, fail }: Base) {
  const { mutateAsync, reset } = useMutation(
    orpc.llmCredential.verify.mutationOptions({ gcTime: 0 }),
  );
  return useCallback(
    async (saved: boolean) => {
      patch({ phase: "verifying" });
      const result = await attempt(() => mutateAsync({ provider: PROVIDER }), reset);
      if (!result.ok) return fail(verifyFailure(result.error), true);
      const { model } = result.value;
      patch({
        phase: "idle",
        flow: null,
        notice: { kind: "status", text: saved ? savedAndVerified(model) : verifiedAgain(model) },
        verifiedModel: model,
        replacing: false,
        invalidated: false,
        unreadable: false,
      });
    },
    [fail, patch, mutateAsync, reset],
  );
}

/** « Enregistrer et vérifier » : `set`, puis `verify` seulement si `set` a réussi. */
function useSave(base: Base, verifyStep: (saved: boolean) => Promise<void>) {
  const { patch, fail, reload, busy } = base;
  const { mutateAsync, reset } = useMutation(orpc.llmCredential.set.mutationOptions({ gcTime: 0 }));
  return useCallback(
    async (input: SetInput): Promise<SaveResult> => {
      const result = await exclusive(busy, async (): Promise<SaveResult> => {
        patch(startingPatch("saving", "save"));
        const saved = await attempt(() => mutateAsync(input), reset);
        if (!saved.ok) {
          const failure = setFailure(saved.error);
          fail(failure, false);
          return failure.invalidKey ? "invalid" : "done";
        }
        reload();
        await verifyStep(true);
        return "done";
      });
      return result ?? "done";
    },
    [busy, patch, fail, reload, mutateAsync, reset, verifyStep],
  );
}

/** « Retirer la clé » : 404 (déjà retirée) vaut succès ; la carte repasse à « absente », le focus au champ. */
function useRemove(base: Base) {
  const { patch, fail, reload, busy, setState } = base;
  const { mutateAsync, reset } = useMutation(
    orpc.llmCredential.remove.mutationOptions({ gcTime: 0 }),
  );
  return useCallback(
    () =>
      exclusive(busy, async () => {
        patch(startingPatch("removing", null));
        const result = await attempt(() => mutateAsync({ provider: PROVIDER }), reset);
        if (!result.ok && errorCode(result.error) !== "NOT_FOUND") {
          return fail(removeFailure(result.error), false);
        }
        reload();
        setState((current) => ({
          ...INITIAL_SESSION,
          notice: { kind: "status", text: L.removed },
          focusSignal: current.focusSignal + 1,
        }));
      }),
    [busy, patch, fail, reload, setState, mutateAsync, reset],
  );
}

/** « Vérifier à nouveau » : `verify` seul, jamais `set`. */
function useVerifyAgain(base: Base, verifyStep: (saved: boolean) => Promise<void>) {
  const { busy, patch } = base;
  return useCallback(
    async () =>
      void (await exclusive(busy, async () => {
        patch(startingPatch("verifying", "verify"));
        await verifyStep(false);
      })),
    [busy, patch, verifyStep],
  );
}

/** Ouverture (focus dans le champ) et fermeture du formulaire de remplacement. */
function useReplaceToggle({ setState, patch }: Base) {
  const openReplace = useCallback(
    () =>
      setState((current) => ({
        ...current,
        replacing: true,
        notice: null,
        focusSignal: current.focusSignal + 1,
      })),
    [setState],
  );
  const closeReplace = useCallback(() => patch({ replacing: false }), [patch]);
  return { openReplace, closeReplace };
}

/**
 * Écritures de la clé du fournisseur (set, verify, remove) et état de session de la carte. Une seule action en vol.
 * La clé n'est ni retenue ici ni dans le cache : elle ne vit que dans l'argument de l'appel `set`, le temps de l'appel.
 */
export function useAiCredentialSession() {
  const { state, ...base } = useBase();
  const countdown = useRetryCountdown(state.rate);
  useUnauthorizedRedirect(state.redirect ? UNAUTHORIZED : undefined);
  const verifyStep = useVerifyStep(base);
  const save = useSave(base, verifyStep);
  const removeKey = useRemove(base);

  const verifyAgain = useVerifyAgain(base, verifyStep);
  const { openReplace, closeReplace } = useReplaceToggle(base);

  const remaining = countdown.remaining ?? state.rate?.retryAfterSeconds ?? null;
  const waiting = state.rate !== null && (remaining ?? 0) > 0;
  return useMemo(
    () => ({
      state,
      remaining,
      announcement: countdown.announcement,
      waiting,
      save,
      verifyAgain,
      removeKey,
      openReplace,
      closeReplace,
    }),
    [
      state,
      remaining,
      countdown.announcement,
      waiting,
      save,
      verifyAgain,
      removeKey,
      openReplace,
      closeReplace,
    ],
  );
}

export type AiCredentialSession = ReturnType<typeof useAiCredentialSession>;

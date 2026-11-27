"use client";

import type { AiPrefillItemInput, AiPrefillItemOutput } from "@koklo/contract";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { describeAiError } from "./ai-errors.ts";
import { errorCode } from "./api-error.ts";
import { orpc } from "./orpc.ts";

/** Aide d'un formulaire du domaine : le type prérempli, son exemple et ce qu'on demande avant d'appeler. */
export interface DomainAssist {
  type: Exclude<AiPrefillItemInput["type"], "feature">;
  hint: string;
  /** « Décrivez d'abord … en une phrase. » */
  missing: string;
}

interface Args<V> {
  projectId: string;
  assist: DomainAssist | undefined;
  values: V;
  set: (patch: Partial<V>) => void;
  reset: () => void;
  announce: (text: string) => void;
}

const isEmpty = (value: unknown): boolean =>
  value === "" || (Array.isArray(value) && value.length === 0);

/** Champs encore vides que l'agent peut remplir : la saisie de l'humain n'est jamais écrasée. */
function patchOf<V>(values: V, output: AiPrefillItemOutput) {
  const current = values as Record<string, unknown>;
  const entries = Object.entries(output.values).filter(
    ([key, value]) => value !== undefined && !isEmpty(value) && isEmpty(current[key]),
  );
  return { patch: Object.fromEntries(entries) as Partial<V>, keys: entries.map(([key]) => key) };
}

function refusal(error: unknown): string {
  const view = describeAiError(error);
  const base =
    errorCode(error) === "FORBIDDEN"
      ? "Le préremplissage n'est pas disponible pour votre rôle."
      : view.message;
  return [base, view.detail, view.action].filter(Boolean).join(" ");
}

/**
 * « Décrire en une phrase » d'un formulaire du domaine (B329 h) : `ai.prefillItem`, seuls les champs vides sont remplis
 * et marqués ; aucune écriture dans la spec. Rend les propriétés de la feuille.
 */
export function useDomainPrefill<V>({ projectId, assist, values, set, reset, announce }: Args<V>) {
  const [text, setText] = useState("");
  const [filled, setFilled] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const mutation = useMutation(orpc.ai.prefillItem.mutationOptions());

  const apply = (output: AiPrefillItemOutput): void => {
    const { patch, keys } = patchOf(values, output);
    set(patch);
    setFilled(new Set(keys));
    announce("Formulaire prérempli par l'agent. Vérifiez chaque champ marqué.");
  };
  const run = (): void => {
    if (!assist || mutation.isPending) return;
    const description = text.trim();
    setError(description ? null : assist.missing);
    if (!description) return;
    mutation.mutate(
      { projectId, type: assist.type, description },
      { onSuccess: apply, onError: (failure) => setError(refusal(failure)) },
    );
  };
  const clear = (): void => {
    reset();
    setFilled(new Set());
    setText("");
    announce("Formulaire vidé.");
  };
  if (!assist) return { filled, sheetProps: {} };
  const box = {
    hint: assist.hint,
    value: text,
    onChange: (next: string) => {
      setText(next);
      setError(null);
    },
    onPrefill: run,
    busy: mutation.isPending,
    error,
  };
  return {
    filled,
    sheetProps: { assist: box, ...(filled.size > 0 ? { filled: { onClear: clear } } : {}) },
  };
}

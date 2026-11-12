"use client";

import type { AiPrefillItemOutput } from "@koklo/contract";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { describeAiError } from "./ai-errors.ts";
import { errorCode } from "./api-error.ts";
import { EMPTY_VALUES, type FeatureFormValues } from "./feature-form.ts";
import { type PrefilledKey, prefillPatch } from "./feature-prefill.ts";
import { orpc } from "./orpc.ts";

interface Args {
  projectId: string;
  values: FeatureFormValues;
  setValues: (patch: Partial<FeatureFormValues>) => void;
  announce: (text: string) => void;
}

/** Texte d'une erreur de préremplissage : la saisie du formulaire reste intacte. */
function refusal(error: unknown): string {
  const view = describeAiError(error);
  const base =
    errorCode(error) === "FORBIDDEN"
      ? "Le préremplissage n'est pas disponible pour votre rôle."
      : view.message;
  return [base, view.detail, view.action].filter(Boolean).join(" ");
}

/**
 * Préremplissage en création (B329 h) : une phrase, `ai.prefillItem`, et seulement les champs encore vides sont
 * remplis et marqués ; aucune écriture dans la spec. « Effacer » vide tout le formulaire.
 */
export function useItemPrefill({ projectId, values, setValues, announce }: Args) {
  const [text, setText] = useState("");
  const [marked, setMarked] = useState<PrefilledKey[]>([]);
  const [error, setError] = useState<string | null>(null);
  const mutation = useMutation(orpc.ai.prefillItem.mutationOptions());

  const apply = (output: AiPrefillItemOutput): void => {
    const patch = prefillPatch(values, output.values);
    setValues(patch.values);
    setMarked((previous) => [...new Set([...previous, ...patch.keys])]);
    announce(
      patch.keys.length > 0
        ? "Formulaire prérempli par l'agent. Vérifiez chaque champ marqué avant d'enregistrer."
        : "L'agent n'a rien à ajouter : les champs déjà remplis sont conservés.",
    );
  };

  return {
    text,
    setText: (next: string): void => {
      setText(next);
      setError(null);
    },
    busy: mutation.isPending,
    error,
    filled: marked.length > 0,
    agentFilled: (key: PrefilledKey): boolean => marked.includes(key),
    run: (): void => {
      if (mutation.isPending) return;
      if (!text.trim()) {
        setError("Décrivez d'abord la fonctionnalité en une phrase.");
        return;
      }
      setError(null);
      mutation.mutate(
        { projectId, type: "feature", description: text.trim() },
        { onSuccess: apply, onError: (failure) => setError(refusal(failure)) },
      );
    },
    clear: (): void => {
      setValues(EMPTY_VALUES);
      setMarked([]);
      setText("");
      setError(null);
      announce("Formulaire vidé.");
    },
  };
}

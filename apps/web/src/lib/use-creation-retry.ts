"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { errorCode } from "./api-error.ts";
import { RETRY_LATER } from "./form-errors.ts";
import { orpc } from "./orpc.ts";
import { useUnauthorizedRedirect } from "./use-unauthorized-redirect.ts";

export interface RetryInput {
  repoName?: string;
  installationId?: string;
}

/**
 * « Réessayer » : `project.retryRepo`. Jamais désactivé par une minuterie ; seul l'appel en vol le grise.
 * Un refus 409 (déjà en cours ou réussi) n'est pas une erreur : l'état est simplement relu.
 */
export function useCreationRetry(projectId: string) {
  const queryClient = useQueryClient();
  const retry = useMutation(orpc.project.retryRepo.mutationOptions());
  const [error, setError] = useState<string>();
  const [lastError, setLastError] = useState<unknown>();
  useUnauthorizedRedirect(lastError);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: orpc.project.creationStatus.key() });
    void queryClient.invalidateQueries({ queryKey: orpc.project.cards.key() });
  };

  async function run(input: RetryInput = {}): Promise<void> {
    if (retry.isPending) return;
    setError(undefined);
    try {
      await retry.mutateAsync({ projectId, ...input });
    } catch (failure) {
      setLastError(failure);
      if (errorCode(failure) === "FORBIDDEN") {
        setError("Vous n'avez plus le droit de relancer la création du dépôt.");
      } else if (errorCode(failure) !== "CONFLICT") {
        setError(RETRY_LATER);
      }
    }
    refresh();
  }

  return { run, pending: retry.isPending, error };
}

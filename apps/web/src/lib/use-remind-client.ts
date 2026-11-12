"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { conflictReason } from "./api-error.ts";
import { orpc } from "./orpc.ts";

/** Avis lu sous « Relancer » : l'envoi, ou la raison pour laquelle rien n'est parti. */
export function remindText(result: { reminded: number } | undefined, error: unknown): string {
  if (conflictReason(error) === "no_client") return "Aucun client n'est invité à ce projet.";
  if (error) return "La relance n'a pas pu être envoyée. Réessayez.";
  if (!result) return "";
  return result.reminded > 0 ? "Rappel envoyé" : "Le client a déjà été relancé aujourd'hui";
}

/** « Relancer <prénom> » (`review.remind`, owner et admin) : un rappel par client et par jour, décidé par le serveur. */
export function useRemindClient(projectId: string) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    ...orpc.review.remind.mutationOptions(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: orpc.project.activity.key() }),
  });
  return {
    pending: mutation.isPending,
    text: remindText(mutation.data, mutation.error),
    remind: () => mutation.mutate({ projectId }),
  };
}

"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { orpc } from "./orpc.ts";

/** Agrégat de la coquille du projet (`project.shell`) : nom, phase, livrables, compteurs. Désactivé sans projet. */
export function useProjectShell(projectId: string | null) {
  return useQuery({
    ...orpc.project.shell.queryOptions({ input: { projectId: projectId ?? "" } }),
    enabled: projectId !== null,
  });
}

/**
 * Enregistre l'ouverture du projet (`project.visit`) une fois par projet ouvert, pas à chaque navigation interne.
 * Préférence personnelle : un échec est silencieux.
 */
export function useProjectVisit(projectId: string | null): void {
  const { mutate } = useMutation(orpc.project.visit.mutationOptions());
  useEffect(() => {
    if (projectId) mutate({ projectId });
  }, [projectId, mutate]);
}

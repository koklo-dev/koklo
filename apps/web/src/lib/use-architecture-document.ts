"use client";

import type { architectureDocSectionSchema } from "@koklo/contract";
import { useQuery } from "@tanstack/react-query";
import type { z } from "zod";
import { orpc } from "./orpc.ts";

export type DocSection = z.infer<typeof architectureDocSectionSchema>;

/** Document d'architecture (`spec.architecture.document`) : sections lues en Git, dans l'ordre de leur préfixe NN. */
export function useArchitectureDocument(projectId: string, enabled: boolean) {
  const query = useQuery({
    ...orpc.spec.architecture.document.queryOptions({ input: { projectId } }),
    enabled,
  });
  return {
    query,
    sections: (query.data?.sections ?? []) as DocSection[],
    loaded: query.data !== undefined,
  };
}

/** Avertissements d'architecture (`spec.architecture.checks`), jamais bloquants ; propositions en attente comprises (B511). */
export function useArchitectureChecks(projectId: string, enabled: boolean) {
  const query = useQuery({
    ...orpc.spec.architecture.checks.queryOptions({ input: { projectId } }),
    enabled,
  });
  return { query, warnings: query.data?.warnings ?? [] };
}

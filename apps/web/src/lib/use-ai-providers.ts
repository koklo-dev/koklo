"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { orpc } from "./orpc.ts";

/** Lectures de l'écran : chaque section charge la sienne (React Query déduplique), rien avant le rôle connu. */
export const useProviderList = () => useQuery(orpc.aiProvider.list.queryOptions());
export const useQualifiedModels = () => useQuery(orpc.aiModel.listQualified.queryOptions());
export const useAiSettings = () => useQuery(orpc.aiSettings.get.queryOptions());
export const useUsageReport = () => useQuery(orpc.aiUsage.report.queryOptions({ input: {} }));

/** Relit tout l'écran après une écriture réussie (liste, modèles, réglages, consommation). */
export function useRefreshAi(): () => Promise<void> {
  const client = useQueryClient();
  return useCallback(async () => {
    const keys = [
      orpc.aiProvider.key(),
      orpc.aiModel.key(),
      orpc.aiSettings.key(),
      orpc.aiUsage.key(),
    ];
    await Promise.all(keys.map((queryKey) => client.invalidateQueries({ queryKey })));
  }, [client]);
}

export type Attempt<T> = { ok: true; value: T } | { ok: false; error: unknown };

/**
 * Lance une écriture puis réinitialise la mutation dans tous les cas : les `variables` (la clé) et l'erreur ne
 * restent ni dans le cache de TanStack ni dans l'observateur (`gcTime: 0` en plus, côté appelant).
 */
export async function attempt<T>(run: () => Promise<T>, reset: () => void): Promise<Attempt<T>> {
  try {
    return { ok: true, value: await run() };
  } catch (error) {
    return { ok: false, error };
  } finally {
    reset();
  }
}

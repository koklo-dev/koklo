"use client";

import type { PageSize } from "@koklo/ui";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { orpc } from "./orpc.ts";

/** Taille de page par défaut d'un jeu d'exemple (maquette 11 l.255) ; 50 et 100 se choisissent (B484). */
export const FIXTURE_PAGE_SIZE: PageSize = 25;
/** Taille choisie, mémorisée par utilisateur dans le navigateur : jamais dans l'adresse partagée. */
export const FIXTURE_SIZE_KEY = "koklo.fixtures.size";

const SIZES: readonly number[] = [25, 50, 100];

function readSize(): PageSize {
  try {
    const stored = Number(window.localStorage.getItem(FIXTURE_SIZE_KEY));
    return SIZES.includes(stored) ? (stored as PageSize) : FIXTURE_PAGE_SIZE;
  } catch {
    return FIXTURE_PAGE_SIZE;
  }
}

/** Page et taille d'un jeu ; la taille se lit après le premier rendu (rien côté serveur), changer de taille revient à la page 1. */
export function useFixturePager() {
  const [page, setPage] = useState(1);
  const [size, setSizeState] = useState<PageSize | null>(null);
  useEffect(() => setSizeState(readSize()), []);
  const setSize = useCallback((next: PageSize) => {
    setSizeState(next);
    setPage(1);
    try {
      window.localStorage.setItem(FIXTURE_SIZE_KEY, String(next));
    } catch {
      // Navigateur sans stockage : la taille vaut pour la visite.
    }
  }, []);
  return { page, setPage, size: size ?? FIXTURE_PAGE_SIZE, setSize, ready: size !== null };
}

/** Les jeux d'exemple du modèle (`spec.data.fixtures.list`) : titre, table, locale et nombre de lignes. */
export function useDataFixtures(projectId: string, enabled: boolean) {
  return useQuery({
    ...orpc.spec.data.fixtures.list.queryOptions({ input: { projectId } }),
    enabled,
  });
}

/** Lignes d'un jeu, 25, 50 ou 100 par page (`spec.data.fixtures.page`) ; la page précédente reste affichée pendant le changement. */
export function useFixtureRows(projectId: string, fixtureId: string) {
  const pager = useFixturePager();
  const query = useQuery({
    ...orpc.spec.data.fixtures.page.queryOptions({
      input: { projectId, fixtureId, page: pager.page, size: pager.size },
    }),
    enabled: pager.ready,
    placeholderData: keepPreviousData,
  });
  return { query, ...pager };
}

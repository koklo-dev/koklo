"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { orpc } from "./orpc.ts";

/** Lignes par page d'un jeu d'exemple (08 §2.2, contrat 3.5.0). */
export const FIXTURE_PAGE_SIZE = 25 as const;

/** Les jeux d'exemple du modèle (`spec.data.fixtures.list`) : titre, table, locale et nombre de lignes. */
export function useDataFixtures(projectId: string, enabled: boolean) {
  return useQuery({
    ...orpc.spec.data.fixtures.list.queryOptions({ input: { projectId } }),
    enabled,
  });
}

/** Lignes d'un jeu, 25 par page ; la page précédente reste affichée pendant le changement de page. */
export function useFixtureRows(projectId: string, fixtureId: string) {
  const [page, setPage] = useState(1);
  const query = useQuery({
    ...orpc.spec.data.fixtures.rows.queryOptions({
      input: { projectId, fixtureId, page, size: FIXTURE_PAGE_SIZE },
    }),
    placeholderData: keepPreviousData,
  });
  return { query, page, setPage };
}

"use client";

import { useQuery } from "@tanstack/react-query";
import { orpc } from "./orpc.ts";

/** Commentaires du client sur une table (`comment.list`, TK-109, B448) : lus par l'équipe dans la fiche. */
export function useTableComments(projectId: string, tableId: string) {
  return useQuery(
    orpc.comment.list.queryOptions({
      input: { projectId, targetKind: "table", targetRef: tableId, limit: 50 },
    }),
  );
}

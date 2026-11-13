"use client";

import { Skeleton } from "@koklo/ui";
import { shortDate } from "../lib/overview-labels.ts";
import { useTableComments } from "../lib/use-table-comments.ts";
import { ErrorNotice } from "./error-notice.tsx";

const LABEL = "text-caption font-semibold uppercase tracking-[0.05em] text-muted-foreground";

/**
 * Commentaires du client sur une table (TK-109, B448), lus par l'équipe dans la vue Fiche : auteur, date, texte. Rien
 * n'est affiché sans commentaire ; l'équipe ne répond pas ici (le suivi passe par le formulaire de la table).
 */
export function DataCommentsSection({
  projectId,
  tableId,
}: {
  projectId: string;
  tableId: string;
}) {
  const query = useTableComments(projectId, tableId);
  if (query.isError) {
    return (
      <ErrorNotice onRetry={() => void query.refetch()}>
        Les commentaires n'ont pas pu être chargés.
      </ErrorNotice>
    );
  }
  if (query.isPending) return <Skeleton aria-busy="true" className="h-10 rounded-[10px]" />;
  const items = query.data.items;
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="fiche-comments" className="flex flex-col gap-1.5">
      <span id="fiche-comments" className={LABEL}>
        Commentaires du client
      </span>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {items.map((item) => (
          <li
            key={item.id}
            className="flex flex-col gap-0.5 rounded-[10px] border border-border p-3"
          >
            <span className="text-caption text-muted-foreground">
              {`${item.authorKind === "client" ? "Client" : "Équipe"} · ${shortDate(item.createdAt)}`}
            </span>
            <p className="m-0 whitespace-pre-wrap text-meta">{item.body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

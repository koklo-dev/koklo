"use client";

import type { ClientDataTable } from "@koklo/contract";
import { Button, type DiagramRelation, Icon, IdTag } from "@koklo/ui";
import {
  CLIENT_SUMMARY_LABEL,
  CLIENT_SUMMARY_MISSING,
  COMMENT_BUTTON,
} from "../lib/data-client-labels.ts";
import { Relations, UsedBy } from "./data-fiche-parts.tsx";

/** « Ce qu'on enregistre » (maquette 11 l.217-219) : les phrases écrites par l'équipe ; la phrase B447 quand elle n'en a pas écrit. */
function Summary({ phrases }: { phrases: readonly string[] }) {
  return (
    <section aria-labelledby="fiche-summary" className="flex flex-col gap-1.5">
      <span id="fiche-summary" className="text-meta font-semibold">
        {CLIENT_SUMMARY_LABEL}
      </span>
      {phrases.length === 0 ? (
        <p className="m-0 text-meta text-muted-foreground">{CLIENT_SUMMARY_MISSING}</p>
      ) : (
        <ul className="m-0 flex list-disc flex-col gap-1 pl-5 text-body">
          {phrases.map((phrase) => (
            <li key={phrase}>{phrase}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * Fiche d'une table vue du client (maquette 11 l.208-228) : identifiant, « Commenter » (absent pour qui ne peut pas),
 * titre, description, « Ce qu'on enregistre », Relations et Utilisée par. Jamais de contrainte, de YAML ni de Mermaid.
 */
export function DataClientFiche({
  table,
  links,
  nameOf,
  onComment,
}: {
  table: ClientDataTable;
  links: readonly DiagramRelation[];
  nameOf: (id: string) => string;
  onComment?: (() => void) | undefined;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <IdTag>{table.id}</IdTag>
        <span className="flex-1" />
        {onComment ? (
          <Button type="button" variant="outline" size="compact" onClick={onComment}>
            <Icon name="add_comment" size={16} />
            {COMMENT_BUTTON}
          </Button>
        ) : null}
      </div>
      <h2 className="m-0 text-settings-title">{table.name}</h2>
      {table.description ? (
        <p className="m-0 text-body leading-[1.55]">{table.description}</p>
      ) : null}
      <Summary phrases={table.clientSummary} />
      <Relations links={links} nameOf={nameOf} />
      <UsedBy sources={table.usedBy} />
    </div>
  );
}

"use client";

import type { TicketStatus } from "@koklo/contract";
import { Badge, Button, cn, Icon, ListFooter } from "@koklo/ui";
import { type DragEvent, type UIEvent, useId, useState } from "react";
import { GENERIC_ERROR } from "../lib/form-errors.ts";
import { STATUS_ICONS, STATUS_LABELS } from "../lib/ticket-labels.ts";
import type { ColumnData } from "../lib/use-kanban-data.ts";
import { KanbanCard } from "./kanban-card.tsx";
import type { KanbanInteraction } from "./kanban-types.ts";

interface KanbanColumnProps {
  status: TicketStatus;
  column: ColumnData;
  interaction: KanbanInteraction;
}

/** La suite se charge quand 80 % de la colonne a défilé (le bouton du pied reste le repli et la voie du clavier). */
const LOAD_NEXT_AT = 0.8;

function countLabel(count: number): string {
  return count > 1 ? `${count} tickets` : `${count} ticket`;
}

function ColumnFailure({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-col items-start gap-2 rounded-md border border-alert-error-border bg-alert-error p-3 text-meta text-alert-error-foreground"
    >
      <p className="flex items-center gap-2 font-medium">
        <Icon name="error" size={18} />
        Impossible de charger cette colonne.
      </p>
      <p>{GENERIC_ERROR}</p>
      <Button type="button" variant="outline" size="sm" onClick={onRetry}>
        Réessayer
      </Button>
    </div>
  );
}

/** Cartes de la colonne dans une zone qui défile (la suite se charge à 80 %), puis son pied (à partir de 30 cartes). */
function ColumnCards({
  column,
  interaction,
}: {
  column: ColumnData;
  interaction: KanbanInteraction;
}) {
  const { canMove, dragKey, moving, focus } = interaction;
  return (
    <div
      data-column-scroll=""
      className="flex max-h-[70vh] flex-col gap-2 overflow-y-auto overscroll-contain"
      onScroll={(event: UIEvent<HTMLDivElement>) => {
        const { scrollTop, clientHeight, scrollHeight } = event.currentTarget;
        // Au clavier, « Charger la suite » ne doit pas se remplacer sous les doigts : focus dans le pied, pas de chargement.
        const footerHasFocus = event.currentTarget
          .querySelector("[data-slot='list-footer']")
          ?.contains(document.activeElement);
        if (footerHasFocus) return;
        if (scrollHeight > 0 && (scrollTop + clientHeight) / scrollHeight >= LOAD_NEXT_AT) {
          column.onLoadMore();
        }
      }}
    >
      <ul className="flex flex-col gap-2">
        {column.tickets.map((ticket) => (
          <KanbanCard
            key={ticket.key}
            ticket={ticket}
            canMove={canMove}
            busy={moving.includes(ticket.key)}
            dragging={dragKey === ticket.key}
            focus={focus?.key === ticket.key ? focus : undefined}
            onMove={interaction.onMove}
            onDragStart={interaction.onDragStart}
            onDragEnd={interaction.onDragEnd}
          />
        ))}
      </ul>
      {column.footer ? (
        <ListFooter
          variant="compact"
          state={column.footer}
          remaining={column.remaining}
          endLabel="Fin de la colonne"
          onLoadMore={column.onLoadMore}
          onRetry={column.onRetry}
        />
      ) : null}
    </div>
  );
}

/** Corps de la colonne : son erreur, « Aucun ticket » ou ses cartes. */
function ColumnBody({
  column,
  interaction,
}: {
  column: ColumnData;
  interaction: KanbanInteraction;
}) {
  if (column.failed) return <ColumnFailure onRetry={column.onRetry} />;
  if (column.tickets.length > 0) return <ColumnCards column={column} interaction={interaction} />;
  return (
    <div className="flex min-h-24 items-center justify-center rounded-md border border-dashed text-meta text-muted-foreground">
      Aucun ticket
    </div>
  );
}

/** Une colonne = un statut ; c'est aussi la cible de dépôt (même vide). */
export function KanbanColumn({ status, column, interaction }: KanbanColumnProps) {
  const headingId = useId();
  const [over, setOver] = useState(false);
  const { canMove, dragFrom } = interaction;
  const label = STATUS_LABELS[status];
  const accepting = canMove && dragFrom !== null && dragFrom !== status;

  const onDragOver = (event: DragEvent<HTMLElement>) => {
    if (!accepting) return;
    event.preventDefault();
    setOver(true);
  };
  const onDragLeave = (event: DragEvent<HTMLElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver(false);
  };
  const onDrop = (event: DragEvent<HTMLElement>) => {
    if (!canMove) return;
    event.preventDefault();
    setOver(false);
    interaction.onDrop(status, event.dataTransfer.getData("text/plain"));
  };

  return (
    <section
      data-testid={`kanban-column-${status}`}
      aria-labelledby={headingId}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={cn(
        "flex w-[85%] shrink-0 snap-start flex-col gap-3 rounded-lg border-2 border-transparent bg-muted/50 p-3 md:w-[17.5rem]",
        "motion-safe:transition-colors",
        over && accepting && "border-ring bg-accent",
      )}
    >
      <div className="flex items-center gap-2">
        <Icon name={STATUS_ICONS[status]} size={18} fill={status === "done"} />
        <h2 id={headingId} className="text-subsection-title">
          {label}
        </h2>
        {column.failed ? null : (
          <Badge variant="outline" aria-label={countLabel(column.total)} className="ml-auto">
            {column.total}
          </Badge>
        )}
      </div>
      {over && accepting ? (
        <p className="text-meta font-medium">{`Déposer ici pour passer en ${label}`}</p>
      ) : null}
      <ColumnBody column={column} interaction={interaction} />
    </section>
  );
}

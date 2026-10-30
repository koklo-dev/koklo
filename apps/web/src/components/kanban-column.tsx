"use client";

import type { TicketOutput, TicketStatus } from "@koklo/contract";
import { Badge, cn, Icon } from "@koklo/ui";
import { type DragEvent, useId, useState } from "react";
import { STATUS_ICONS, STATUS_LABELS } from "../lib/ticket-labels.ts";
import { KanbanCard } from "./kanban-card.tsx";
import type { KanbanInteraction } from "./kanban-types.ts";

interface KanbanColumnProps {
  status: TicketStatus;
  tickets: readonly TicketOutput[];
  interaction: KanbanInteraction;
}

function countLabel(count: number): string {
  return count > 1 ? `${count} tickets` : `${count} ticket`;
}

/** Une colonne = un statut ; c'est aussi la cible de dépôt (même vide). */
export function KanbanColumn({ status, tickets, interaction }: KanbanColumnProps) {
  const headingId = useId();
  const [over, setOver] = useState(false);
  const { canMove, dragFrom, dragKey, moving, focus } = interaction;
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
        <h2 id={headingId} className="text-sm font-semibold">
          {label}
        </h2>
        <Badge variant="outline" aria-label={countLabel(tickets.length)} className="ml-auto">
          {tickets.length}
        </Badge>
      </div>
      {over && accepting ? (
        <p className="text-[13px] font-medium">{`Déposer ici pour passer en ${label}`}</p>
      ) : null}
      {tickets.length === 0 ? (
        <div className="flex min-h-24 items-center justify-center rounded-md border border-dashed text-[13px] text-muted-foreground">
          Aucun ticket
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {tickets.map((ticket) => (
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
      )}
    </section>
  );
}

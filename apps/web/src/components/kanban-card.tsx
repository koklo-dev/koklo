"use client";

import type { TicketOutput, TicketStatus } from "@koklo/contract";
import {
  Badge,
  Button,
  Card,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  Icon,
} from "@koklo/ui";
import { useEffect, useId, useRef } from "react";
import {
  PRIORITY_LABELS,
  STATUS_ICONS,
  STATUS_LABELS,
  STATUS_ORDER,
} from "../lib/ticket-labels.ts";
import type { FocusRequest } from "../lib/use-ticket-move.ts";

interface KanbanCardProps {
  ticket: TicketOutput;
  canMove: boolean;
  busy: boolean;
  dragging: boolean;
  focus: FocusRequest | undefined;
  onMove: (ticket: TicketOutput, to: TicketStatus) => void;
  onDragStart: (key: string) => void;
  onDragEnd: () => void;
}

const HEAVY = new Set<string>(["critical", "high"]);

function Meta({ ticket }: { ticket: TicketOutput }) {
  const sensitive = ticket.sensitivity === "sensitive";
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
      <Badge variant="outline" className="font-mono">
        {ticket.pkg}
      </Badge>
      <Badge variant="outline" data-testid="kanban-sensitivity" className="gap-1">
        {sensitive ? <Icon name="lock" size={16} /> : null}
        {sensitive ? "Sensible" : "Sûr"}
      </Badge>
      <span
        className={
          HEAVY.has(ticket.priority) ? "font-semibold text-foreground" : "text-muted-foreground"
        }
      >
        {PRIORITY_LABELS[ticket.priority]}
      </span>
    </div>
  );
}

/** « Déplacer » : l'alternative clavier et tactile au glisser-déposer (WCAG 2.5.7). */
function MoveMenu({
  ticket,
  busy,
  onMove,
  buttonRef,
}: Pick<KanbanCardProps, "ticket" | "busy" | "onMove"> & {
  buttonRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const labelId = useId();
  const label = busy ? `Déplacement de ${ticket.key}…` : `Déplacer ${ticket.key}`;
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild disabled={busy}>
        <Button
          ref={buttonRef}
          variant="ghost"
          size="sm"
          aria-label={label}
          className="-mr-2 h-11 md:h-8"
        >
          <Icon name="drag_indicator" size={16} />
          {busy ? "Déplacement…" : "Déplacer"}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" aria-labelledby={labelId}>
        <DropdownMenuLabel id={labelId}>{`Déplacer ${ticket.key} vers`}</DropdownMenuLabel>
        {STATUS_ORDER.filter((status) => status !== ticket.status).map((status) => (
          <DropdownMenuItem
            key={status}
            className="min-h-11 md:min-h-0"
            onSelect={() => onMove(ticket, status)}
          >
            <Icon name={STATUS_ICONS[status]} size={16} />
            {STATUS_LABELS[status]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function KanbanCard({
  ticket,
  canMove,
  busy,
  dragging,
  focus,
  onMove,
  onDragStart,
  onDragEnd,
}: KanbanCardProps) {
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (focus) button.current?.focus();
  }, [focus]);
  const draggable = canMove && !busy;
  return (
    <li
      data-testid={`kanban-card-${ticket.key}`}
      aria-busy={busy || undefined}
      draggable={draggable}
      onDragStart={(event) => {
        event.dataTransfer.setData("text/plain", ticket.key);
        event.dataTransfer.effectAllowed = "move";
        onDragStart(ticket.key);
      }}
      onDragEnd={onDragEnd}
    >
      <Card
        className={cn(
          "flex flex-col gap-2 p-3 motion-safe:transition-opacity",
          draggable && "cursor-grab active:cursor-grabbing",
          busy && "opacity-60",
          dragging && "border-dashed border-ring opacity-50",
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-xs text-muted-foreground">{ticket.key}</span>
          {canMove ? (
            <MoveMenu ticket={ticket} busy={busy} onMove={onMove} buttonRef={button} />
          ) : null}
        </div>
        <p className="line-clamp-3 text-sm font-medium" title={ticket.title}>
          {ticket.title}
        </p>
        <Meta ticket={ticket} />
      </Card>
    </li>
  );
}

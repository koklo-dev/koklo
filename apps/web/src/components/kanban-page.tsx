"use client";

import type { TicketOutput, TicketStatus } from "@koklo/contract";
import { useState } from "react";
import { describeFailure } from "../lib/kanban-failure.ts";
import { canMoveTickets } from "../lib/roles.ts";
import { useActiveOrganization } from "../lib/use-active-organization.ts";
import { useKanbanData } from "../lib/use-kanban-data.ts";
import { useTicketMove } from "../lib/use-ticket-move.ts";
import { useUnauthorizedRedirect } from "../lib/use-unauthorized-redirect.ts";
import { KanbanView } from "./kanban-view.tsx";

const GRABBED = "saisi. Déposez-le sur une colonne.";

/** Kanban du sprint actif : données, déplacement (menu ou glisser), rôle et annonces. */
export function KanbanPage() {
  const { data, reload, retry } = useKanbanData();
  const { role } = useActiveOrganization();
  const move = useTicketMove(reload);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const redirecting = useUnauthorizedRedirect(move.failure?.error);

  const tickets = data.status === "ready" ? data.tickets : [];
  const find = (key: string | null) => tickets.find((ticket) => ticket.key === key);
  const canMove = canMoveTickets(role);

  const start = (ticket: TicketOutput, to: TicketStatus) => {
    if (!canMove || ticket.status === to || move.moving.includes(ticket.key)) return;
    void move.run(ticket.key, ticket.status, to);
  };
  const failure = move.failure && !redirecting ? move.failure : null;
  const notice = failure ? describeFailure(failure) : null;
  const onNoticeAction = () => {
    if (!failure || !notice) return;
    if (notice.action === "reload") void reload();
    else void move.run(failure.key, failure.from, failure.to);
  };

  return (
    <KanbanView
      data={data}
      onRetry={retry}
      announcement={move.announcement}
      notice={notice}
      onNoticeClose={move.dismiss}
      onNoticeAction={onNoticeAction}
      interaction={{
        canMove,
        moving: move.moving,
        dragKey,
        dragFrom: find(dragKey)?.status ?? null,
        focus: move.focus,
        onMove: start,
        onDragStart: (key) => {
          setDragKey(key);
          move.announce(`${key} ${GRABBED}`);
        },
        onDragEnd: () => {
          setDragKey(null);
          move.announce((text) => (text.endsWith(GRABBED) ? "" : text));
        },
        onDrop: (to, transferred) => {
          const ticket = find(transferred || dragKey);
          setDragKey(null);
          if (ticket) start(ticket, to);
        },
      }}
    />
  );
}

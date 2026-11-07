"use client";

import type { TicketOutput, TicketStatus } from "@koklo/contract";
import { ProjectHeader } from "@koklo/ui";
import { useState } from "react";
import { describeFailure } from "../lib/kanban-failure.ts";
import { canMoveTickets } from "../lib/roles.ts";
import { projectPath } from "../lib/shell-routes.ts";
import { useActiveOrganization } from "../lib/use-active-organization.ts";
import { type KanbanData, useKanbanData } from "../lib/use-kanban-data.ts";
import { useProjectShell } from "../lib/use-project-shell.ts";
import { useTicketMove } from "../lib/use-ticket-move.ts";
import { useUnauthorizedRedirect } from "../lib/use-unauthorized-redirect.ts";
import { KanbanView } from "./kanban-view.tsx";
import { PageBody } from "./page-body.tsx";
import { ShellLink } from "./shell-link.tsx";

const GRABBED = "saisi. Déposez-le sur une colonne.";

/** « Sprint SP-7 · objectif · 10 tickets » : le résumé de l'en-tête, absent tant que le sprint n'est pas lu. */
function sprintSummary(data: KanbanData): string | undefined {
  if (data.status !== "ready") return undefined;
  const count = data.total === 1 ? "1 ticket" : `${data.total} tickets`;
  return `Sprint ${data.sprintKey} · ${data.goal} · ${count}`;
}

type KanbanSource = ReturnType<typeof useKanbanData>;

/** Tableau : déplacement (menu ou glisser), rôle et annonces. */
function KanbanBoard({ projectId, source }: { projectId: string; source: KanbanSource }) {
  const { data, reload, retry, totalOf } = source;
  const { role } = useActiveOrganization();
  const move = useTicketMove(projectId, reload, totalOf);
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

/** Kanban du sprint actif du projet de l'URL : en-tête de projet (résumé du sprint), puis le tableau. */
export function KanbanPage({ projectId }: { projectId: string }) {
  const source = useKanbanData(projectId);
  const shell = useProjectShell(projectId);
  const summary = sprintSummary(source.data);
  return (
    <>
      <ProjectHeader
        project={{ name: shell.data?.name ?? "Projet", href: projectPath(projectId) }}
        page="Tickets"
        title="Tickets"
        {...(summary ? { summary } : {})}
        LinkComponent={ShellLink}
      />
      <PageBody>
        <KanbanBoard projectId={projectId} source={source} />
      </PageBody>
    </>
  );
}

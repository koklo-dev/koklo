import { Button, Card, Icon } from "@koklo/ui";
import type { ReactNode } from "react";
import { GENERIC_ERROR } from "../lib/form-errors.ts";
import type { FailureNotice } from "../lib/kanban-failure.ts";
import { STATUS_ORDER } from "../lib/ticket-labels.ts";
import type { KanbanData } from "../lib/use-kanban-data.ts";
import { ErrorNotice } from "./error-notice.tsx";
import { KanbanColumn } from "./kanban-column.tsx";
import { KanbanNotice } from "./kanban-notice.tsx";
import type { KanbanInteraction } from "./kanban-types.ts";

export interface KanbanViewProps {
  data: KanbanData;
  onRetry: () => void;
  interaction: KanbanInteraction;
  announcement: string;
  notice: FailureNotice | null;
  onNoticeAction: () => void;
  onNoticeClose: () => void;
}

const SKELETON_CARDS = [2, 3, 2, 3, 2, 3, 2];

function Loading() {
  return (
    <div
      data-testid="kanban-loading"
      role="status"
      aria-busy="true"
      className="flex flex-col gap-4"
    >
      <p className="text-[13px] text-muted-foreground">Chargement du kanban…</p>
      <div className="flex gap-4 overflow-hidden" aria-hidden="true">
        {SKELETON_CARDS.map((cards, column) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: squelettes statiques, sans identité
            key={column}
            className="flex w-[85%] shrink-0 flex-col gap-3 rounded-lg bg-muted/50 p-3 md:w-[17.5rem]"
          >
            <div className="h-6 rounded-md bg-muted motion-safe:animate-pulse" />
            {Array.from({ length: cards }, (_, card) => (
              <div
                // biome-ignore lint/suspicious/noArrayIndexKey: squelettes statiques, sans identité
                key={card}
                className="h-[88px] rounded-lg bg-muted motion-safe:animate-pulse"
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function CenteredCard({
  testId,
  icon,
  title,
  children,
}: {
  testId: string;
  icon: "checklist" | "account_tree";
  title: string;
  children: ReactNode;
}) {
  return (
    <Card data-testid={testId} className="flex flex-col items-center gap-2 p-8 text-center">
      <Icon name={icon} size={28} className="text-muted-foreground" />
      <h2 className="text-base font-semibold tracking-[-0.015em]">{title}</h2>
      {children}
    </Card>
  );
}

function Header({
  data,
  readOnly,
}: {
  data: Extract<KanbanData, { status: "ready" }>;
  readOnly: boolean;
}) {
  return (
    <div className="flex flex-col gap-1 text-[13px] text-muted-foreground">
      <div className="flex flex-wrap gap-x-3">
        <p>{`Sprint ${data.sprintKey} · ${data.goal}`}</p>
        <p>{data.total === 1 ? "1 ticket" : `${data.total} tickets`}</p>
      </div>
      {readOnly ? (
        <p className="flex items-center gap-1">
          <Icon name="lock" size={16} />
          Lecture seule : votre rôle ne permet pas de déplacer les tickets.
        </p>
      ) : null}
      {data.total === 0 ? <p>Ce sprint ne contient encore aucun ticket.</p> : null}
    </div>
  );
}

function Board({
  data,
  interaction,
  announcement,
  notice,
  onNoticeAction,
  onNoticeClose,
}: Omit<KanbanViewProps, "onRetry" | "data"> & { data: Extract<KanbanData, { status: "ready" }> }) {
  return (
    <div data-testid="kanban-board" className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Header data={data} readOnly={!interaction.canMove} />
        <div role="status" className="text-[13px] text-muted-foreground empty:hidden">
          {announcement}
        </div>
      </div>
      {notice ? (
        <KanbanNotice notice={notice} onAction={onNoticeAction} onClose={onNoticeClose} />
      ) : null}
      <section
        aria-label="Colonnes du kanban"
        // biome-ignore lint/a11y/noNoninteractiveTabindex: région défilante atteignable au clavier (axe scrollable-region-focusable)
        tabIndex={0}
        className="flex snap-x snap-proximity gap-4 overflow-x-auto pb-2 md:snap-none"
      >
        {STATUS_ORDER.map((status) => (
          <KanbanColumn
            key={status}
            status={status}
            tickets={data.columns[status]}
            interaction={interaction}
          />
        ))}
      </section>
    </div>
  );
}

/** Les états du kanban : chargement, erreur, sans sprint actif, sans projet, tableau. */
export function KanbanView({ data, onRetry, ...board }: KanbanViewProps) {
  switch (data.status) {
    case "loading":
      return <Loading />;
    case "error":
      return (
        <div data-testid="kanban-error">
          <ErrorNotice title="Impossible de charger le kanban" onRetry={onRetry}>
            {GENERIC_ERROR}
          </ErrorNotice>
        </div>
      );
    case "no-sprint":
      return (
        <CenteredCard testId="kanban-no-sprint" icon="checklist" title="Aucun sprint actif">
          <p className="text-[13px] text-muted-foreground">
            Le kanban affiche les tickets du sprint en cours. Il apparaîtra dès qu'un sprint sera
            démarré.
          </p>
        </CenteredCard>
      );
    case "no-project":
      return (
        <CenteredCard
          testId="kanban-no-project"
          icon="account_tree"
          title="Aucun projet pour le moment"
        >
          <Button asChild variant="outline" className="h-11 md:h-9">
            <a href="/projects">Voir les projets</a>
          </Button>
        </CenteredCard>
      );
    case "ready":
      return <Board data={data} {...board} />;
  }
}

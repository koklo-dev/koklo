import type { ProjectOverview } from "@koklo/contract";
import {
  DeliverableCard,
  EmptyState,
  IdTag,
  ListPanel,
  ListRow,
  PageStatus,
  TicketStatus,
} from "@koklo/ui";
import {
  DELIVERABLE_TITLES,
  deliverableIcon,
  deliverableStatusOf,
  LIST_FOOTER,
  ticketStatusOf,
} from "../lib/overview-labels.ts";
import { ideaPath, ticketsPath } from "../lib/shell-routes.ts";
import { ShellLink } from "./shell-link.tsx";

type Main = ProjectOverview["main"];

function Deliverables({ main }: { main: Extract<Main, { kind: "deliverables" }> }) {
  return (
    <section aria-labelledby="overview-deliverables" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-2">
        <h2 id="overview-deliverables" className="text-section-title">
          Livrables du cadrage
        </h2>
        <p className="text-meta text-muted-foreground">
          La baseline 0 se pose quand les 7 livrables sont validés. Le client valide obligatoirement
          le fonctionnel et le design.
        </p>
      </div>
      <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(260px,1fr))]">
        {main.items.map((item) => (
          <DeliverableCard
            key={item.key}
            icon={deliverableIcon(item.key)}
            title={DELIVERABLE_TITLES[item.key]}
            content={item.content}
            status={deliverableStatusOf(item.status)}
            progress={item.progressLabel}
            validator={{ kind: item.validator, label: item.validatorLabel }}
            {...(item.done !== undefined && item.total
              ? { gauge: { done: item.done, total: item.total } }
              : {})}
            {...(item.available ? (item.href ? { href: item.href } : {}) : { soon: true })}
            LinkComponent={ShellLink}
          />
        ))}
      </div>
    </section>
  );
}

function IdeaList({
  main,
  projectId,
  team,
}: {
  main: Extract<Main, { kind: "idea" }>;
  projectId: string;
  team: boolean;
}) {
  if (main.pages.length === 0) {
    return (
      <EmptyState
        icon="lightbulb"
        title="Le dossier d'idée est vide"
        description="Les pages apparaissent ici dès que le dossier est commencé."
      />
    );
  }
  return (
    <ListPanel
      title="Dossier d'idée"
      {...(team ? { viewAll: { href: ideaPath(projectId), label: "Ouvrir le dossier" } } : {})}
      footer={team ? LIST_FOOTER : undefined}
      density="comfortable"
      LinkComponent={ShellLink}
    >
      {main.pages.map((page) => (
        <ListRow
          key={page.position}
          leading={<IdTag>{String(page.position).padStart(2, "0")}</IdTag>}
          title={page.title}
          subtitle={page.note}
          trailing={<PageStatus status={page.status} pill="status" />}
        />
      ))}
    </ListPanel>
  );
}

function SprintList({
  main,
  projectId,
  team,
}: {
  main: Extract<Main, { kind: "sprint" }>;
  projectId: string;
  team: boolean;
}) {
  if (!main.sprint) {
    return (
      <EmptyState
        icon="flag"
        title="Aucun sprint en cours"
        description="Les tickets du sprint apparaissent ici dès qu'un sprint démarre."
      />
    );
  }
  return (
    <ListPanel
      title={`Sprint ${main.sprint.key} · ${main.sprint.goal}`}
      {...(team ? { viewAll: { href: ticketsPath(projectId), label: "Ouvrir le kanban" } } : {})}
      footer={team ? LIST_FOOTER : undefined}
      density="comfortable"
      LinkComponent={ShellLink}
    >
      {main.tickets.map((ticket) => (
        <ListRow
          key={ticket.key}
          leading={<IdTag>{ticket.key}</IdTag>}
          title={ticket.title}
          subtitle={ticket.note}
          trailing={<TicketStatus status={ticketStatusOf(ticket.status)} />}
        />
      ))}
    </ListPanel>
  );
}

/** Bloc principal de la phase : livrables, dossier d'idée ou sprint (maquette 07 l.126-166). */
export function OverviewMain({
  main,
  projectId,
  team,
}: {
  main: Main;
  projectId: string;
  team: boolean;
}) {
  if (main.kind === "deliverables") return <Deliverables main={main} />;
  if (main.kind === "idea") return <IdeaList main={main} projectId={projectId} team={team} />;
  return <SprintList main={main} projectId={projectId} team={team} />;
}

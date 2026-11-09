"use client";

import {
  ActivityFeed,
  Button,
  DeliverableCard,
  DeliverableStatus,
  IdTag,
  ListPanel,
  ListRow,
  NextStep,
  PageStatus,
  PersonRow,
  SegmentedGauge,
  StatCard,
  TicketStatus,
} from "@koklo/ui";
import { DevUiFrame, DevUiRow, DevUiSection } from "./dev-ui-frame.tsx";

const CLIENT = { kind: "client", label: "Validation client · obligatoire" } as const;
const TEAM = { kind: "team", label: "Validation de l'équipe · le client lit et commente" } as const;

const ACTIVITY = [
  { actor: { kind: "client", initials: "ML" }, text: "Marie a validé F-001", when: "hier" },
  {
    actor: { kind: "agent", initials: "IA" },
    text: "L'agent a proposé 3 pages",
    when: "il y a 2 h",
  },
  {
    actor: { kind: "team", initials: "AK" },
    text: "Awa a marqué Vision comme stable",
    when: "3 nov.",
  },
] as const;

function Gauges() {
  return (
    <DevUiFrame title="SegmentedGauge : 6, 5, validé, plafond 12">
      <div className="flex flex-col gap-3">
        <SegmentedGauge done={3} total={10} />
        <SegmentedGauge done={4} total={7} height={5} />
        <SegmentedGauge done={7} total={7} height={5} tone="validated" />
        <SegmentedGauge done={30} total={60} />
      </div>
    </DevUiFrame>
  );
}

function NextSteps() {
  return (
    <DevUiFrame title="NextStep : avertissement (lien), bouton, neutre sans action" wide>
      <div className="flex flex-col gap-3">
        <NextStep
          title="Marie doit valider le cahier fonctionnel"
          body="4 fonctionnalités sur 7 sont validées."
          action={{ label: "Ouvrir", href: "/dev/ui#dev-ui-overview" }}
        />
        <NextStep
          title="Marie n'a pas répondu depuis 3 jours"
          body="Un lien vers le cahier peut lui être renvoyé."
          action={{ label: "Relancer Marie", onClick: () => {} }}
        />
        <NextStep tone="neutral" title="Rien n'attend d'action." />
      </div>
    </DevUiFrame>
  );
}

function Deliverables() {
  return (
    <DevUiFrame title="DeliverableCard : à valider, à revoir, validé, bientôt" wide>
      <div className="grid gap-3 md:grid-cols-[repeat(auto-fit,minmax(260px,1fr))]">
        <DeliverableCard
          icon="task_alt"
          title="Cahier fonctionnel"
          content="7 fonctionnalités"
          status="pending"
          gauge={{ done: 4, total: 7 }}
          progress="4 fonctionnalités validées sur 7"
          validator={CLIENT}
          href="/dev/ui#dev-ui-overview"
        />
        <DeliverableCard
          icon="task_alt"
          title="Cahier fonctionnel"
          content="7 fonctionnalités"
          status="revise"
          gauge={{ done: 2, total: 7 }}
          progress="2 fonctionnalités validées sur 7"
          validator={CLIENT}
          href="/dev/ui#dev-ui-overview"
        />
        <DeliverableCard
          icon="task_alt"
          title="Cahier fonctionnel"
          content="7 fonctionnalités"
          status="validated"
          gauge={{ done: 7, total: 7 }}
          progress="7 fonctionnalités validées sur 7"
          validator={CLIENT}
          href="/dev/ui#dev-ui-overview"
        />
        <DeliverableCard
          soon
          icon="database"
          title="Modèle de données"
          content="Bientôt disponible"
          status="todo"
          progress="À faire"
          validator={TEAM}
        />
      </div>
    </DevUiFrame>
  );
}

function Lists() {
  return (
    <>
      <DevUiFrame title="TicketStatus">
        <DevUiRow>
          <TicketStatus status="in_review" />
          <TicketStatus status="in_progress" />
          <TicketStatus status="in_progress" agent />
          <TicketStatus status="done" />
          <TicketStatus status="todo" />
        </DevUiRow>
        <DevUiRow>
          <DeliverableStatus status="revise" />
        </DevUiRow>
      </DevUiFrame>
      <DevUiFrame title="ActivityFeed et PersonRow">
        <ActivityFeed label="Activité de la démonstration" items={ACTIVITY} />
        <PersonRow
          name="Marie Lefèvre"
          initials="ML"
          roleLabel="Client · valide le cadrage"
          kind="client"
        />
        <PersonRow name="Awa Koné" initials="AK" roleLabel="Propriétaire" kind="team" />
      </DevUiFrame>
    </>
  );
}

function Comfortable() {
  return (
    <>
      <DevUiFrame title="StatCard density=comfortable (marges 16 / 18, valeur 26, note 13)">
        <StatCard
          density="comfortable"
          icon="inventory_2"
          label="Livrables validés"
          value="2 sur 7"
          segments={{ done: 2, total: 7 }}
          note="données et architecture"
        />
      </DevUiFrame>
      <DevUiFrame
        title="ListPanel density=comfortable, PageStatus status (neutre au contour), Button compact"
        wide
      >
        <ListPanel
          title="Dossier d'idée"
          viewAll={{ href: "/dev/ui#dev-ui-overview", label: "Ouvrir le dossier" }}
          footer="Les 5 éléments les plus urgents"
          density="comfortable"
        >
          <ListRow
            leading={<IdTag>02</IdTag>}
            title="Utilisateurs, avec un titre assez long pour passer à la ligne sur un écran étroit"
            subtitle="1 proposition de l'agent"
            trailing={<PageStatus status="review" pill="status" />}
          />
          <ListRow
            leading={<IdTag>00</IdTag>}
            title="Vision"
            subtitle="Stable"
            trailing={<PageStatus status="stable" pill="status" />}
          />
        </ListPanel>
        <Button variant="outline" size="compact">
          Voir toute l'activité
        </Button>
      </DevUiFrame>
    </>
  );
}

/** Section « Vue d'ensemble » de la galerie (TK-92, DESIGN.md §5.11) : jauges, prochaine étape, livrables, listes. */
export function DevUiOverview() {
  return (
    <DevUiSection id="dev-ui-overview" title="14. Vue d'ensemble">
      <Gauges />
      <Lists />
      <NextSteps />
      <Deliverables />
      <Comfortable />
    </DevUiSection>
  );
}

"use client";

import {
  Button,
  Icon,
  IdTag,
  ListPanel,
  ListRow,
  PageHeader,
  PhaseRail,
  PriorityIndicator,
  ProjectHeader,
  ValidationStatus,
} from "@koklo/ui";
import { useState } from "react";
import { DevUiFrame, DevUiNote, DevUiSection } from "./dev-ui-frame.tsx";

const ROWS = [
  { id: "F-001", title: "Réserver un créneau", sub: "3 critères · R-012", status: "validated" },
  { id: "F-002", title: "Annuler une réservation", sub: "2 critères · R-014", status: "pending" },
  { id: "F-003", title: "Recevoir un rappel", sub: "4 critères · R-020", status: "revise" },
] as const;

const PRIORITY = ["haute", "moyenne", "basse"] as const;

const STATUS = {
  validated: "validated",
  pending: "pending",
  revise: "revise",
} as const;

function SelectableRows() {
  const [current, setCurrent] = useState<string>("F-002");
  return (
    <ListPanel title="Fonctionnalités à relire" viewAll={{ href: "/dev/ui" }} footer="3 sur 7">
      {ROWS.map((row) => (
        <ListRow
          key={row.id}
          selected={row.id === current}
          onSelect={() => setCurrent(row.id)}
          leading={<IdTag>{row.id}</IdTag>}
          title={row.title}
          subtitle={row.sub}
          trailing={<ValidationStatus status={STATUS[row.status]} />}
        />
      ))}
    </ListPanel>
  );
}

function LinkRows() {
  return (
    <ListPanel label="Fonctionnalités (liens)">
      {ROWS.map((row, i) => (
        <ListRow
          key={row.id}
          href="/dev/ui"
          fixedHeight
          leading={<Icon name="description" size={20} className="text-muted-foreground" />}
          title={row.title}
          subtitle={row.sub}
          trailing={
            <PriorityIndicator level={(i + 1) as 1 | 2 | 3} label={`Priorité ${PRIORITY[i]}`} />
          }
        />
      ))}
    </ListPanel>
  );
}

function ActionRows() {
  return (
    <ListPanel title="Actions en queue">
      <ListRow
        title="Marie Dupont"
        subtitle="Membre depuis mars"
        trailing={
          <Button size="sm" variant="outline">
            Retirer
          </Button>
        }
      />
      <ListRow
        title="Paul Martin"
        subtitle="Invité"
        trailing={
          <Button size="sm" variant="outline">
            Renvoyer
          </Button>
        }
      />
    </ListPanel>
  );
}

function Headers() {
  return (
    <>
      <DevUiFrame title="ProjectHeader : status et résumé en ligne" wide>
        <ProjectHeader
          className="rounded-xl border"
          headingAs="h4"
          project={{ name: "Portail de réservation", href: "/dev/ui" }}
          section="Spec"
          page="Fonctionnel"
          title="Cahier fonctionnel"
          status={
            <ValidationStatus status="pending" label="À valider par le client · obligatoire" />
          }
          summary="4 fonctionnalités validées sur 7"
          sha={{ value: "a1b2c3d", age: "il y a 12 min" }}
          primaryAction={<Button>Nouvelle fonctionnalité</Button>}
          secondaryActions={<Button variant="outline">Cadrer avec l'IA</Button>}
          tabsLabel="Sections de la spec (liste B)"
          tabs={[
            { label: "Fonctionnalités", href: "/dev/ui", active: true, count: 7 },
            { label: "Décisions", href: "/dev/ui" },
          ]}
        />
      </DevUiFrame>
      <DevUiFrame title="PageHeader" wide>
        <PageHeader
          className="rounded-xl border"
          headingAs="h4"
          breadcrumb={[
            { label: "Atelier Lumière", href: "/dev/ui" },
            { label: "Réglages", href: "/dev/ui" },
            { label: "Membres" },
          ]}
          title="Réglages"
          summary="Atelier Lumière · 3 projets · 6 membres"
          status={<ValidationStatus status="validated" label="Plan actif" />}
          actions={<Button>Inviter un membre</Button>}
        />
        <DevUiNote>Sans fil ni état</DevUiNote>
        <PageHeader className="rounded-xl border" headingAs="h4" title="Organisation" />
      </DevUiFrame>
      <DevUiFrame title="PhaseRail inline">
        <PhaseRail phase="framing" size="inline" />
        <PhaseRail phase="iterations" size="inline" />
      </DevUiFrame>
    </>
  );
}

/** `ListRow as="div"` : le contenu de ligne d'un hôte qui pose déjà son `li` (VirtualList, TK-141). */
function DivRow() {
  return (
    <ul className="m-0 list-none rounded-xl border p-0">
      <li data-testid="list-row-div-host" className="flex h-[52px] items-center px-4">
        <ListRow
          as="div"
          leading={<IdTag>F-001</IdTag>}
          title="Réserver un créneau"
          subtitle="3 critères"
          trailing={<PriorityIndicator level={3} label="Haute" />}
        />
      </li>
    </ul>
  );
}

/** TK-140 lot B : lignes et en-têtes (fiche S-dev-ui, captures lists-b-*). */
export function DevUiListsB() {
  return (
    <DevUiSection id="dev-ui-lists-b" title="Listes · B">
      <DevUiFrame title="ListPanel et ListRow sélectionnable">
        <SelectableRows />
      </DevUiFrame>
      <DevUiFrame title="ListRow lien, hauteur fixe 52">
        <LinkRows />
      </DevUiFrame>
      <DevUiFrame title="ListRow, actions en queue">
        <ActionRows />
      </DevUiFrame>
      <DevUiFrame title="ListRow as=div, dans l'li d'un hôte">
        <DivRow />
      </DevUiFrame>
      <Headers />
    </DevUiSection>
  );
}

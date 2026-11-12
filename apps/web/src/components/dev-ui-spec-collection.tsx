"use client";

import {
  DeliverableStatus,
  type DeliverableStatusValue,
  IdTag,
  LifecycleStatus,
  ListRow,
  PriorityIndicator,
  ProposalCriterion,
  SpecCollection,
  SpecNav,
  ValidationStatus,
} from "@koklo/ui";
import { useState } from "react";
import { DevUiFrame, DevUiSection } from "./dev-ui-frame.tsx";

const ROWS = [
  {
    id: "F-001",
    title: "Réserver un créneau en ligne",
    sub: "2 critères · R-001, P-reserver",
    level: 3,
    label: "Indispensable",
    validation: "validated",
  },
  {
    id: "F-002",
    title: "Rappel par SMS avant le rendez-vous",
    sub: "1 critère · R-003",
    level: 2,
    label: "Importante",
    validation: "pending",
  },
  {
    id: "F-003",
    title: "Liste d'attente",
    sub: "1 critère",
    level: 1,
    label: "Souhaitable",
    validation: "revise",
  },
] as const;

const STATUSES: readonly DeliverableStatusValue[] = [
  "ready",
  "generating",
  "in_progress",
  "pending",
  "validated",
];

const HREFS = { functional: "#", data: "#" };

function Row({
  row,
  selected,
  onOpen,
}: {
  row: (typeof ROWS)[number];
  selected: boolean;
  onOpen: () => void;
}) {
  return (
    <ListRow
      as="div"
      selected={selected}
      onSelect={onOpen}
      leading={<IdTag className="shrink-0">{row.id}</IdTag>}
      title={row.title}
      subtitle={row.sub}
      trailing={
        <div className="hidden shrink-0 items-center gap-4 md:flex">
          <PriorityIndicator level={row.level} label={row.label} className="w-28" />
          <ValidationStatus status={row.validation} />
        </div>
      }
    />
  );
}

function Detail() {
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <IdTag>F-001</IdTag>
        <ValidationStatus status="validated" />
      </div>
      <h2 className="text-section-title">Réserver un créneau en ligne</h2>
      <LifecycleStatus stage={2} />
      <p className="text-body">
        Le client choisit un service, un créneau libre et confirme sa réservation.
      </p>
      <h3 className="text-subsection-title">Critères d'acceptation</h3>
      <ol className="m-0 flex list-none flex-col gap-2 p-0">
        <ProposalCriterion
          id="AC-1"
          title="Créneau libre"
          steps={[{ label: "Étant donné", text: "un service de 30 minutes" }]}
        />
      </ol>
    </>
  );
}

/** Section « 18. Collection de la spec » de la galerie (TK-102, DESIGN.md §5.15) : liste, fiche ancrée, statuts, pastilles. */
export function DevUiSpecCollection() {
  const [selected, setSelected] = useState<string | null>("F-001");
  return (
    <DevUiSection id="dev-ui-spec-collection" title="18. Collection de la spec">
      <DevUiFrame title="SpecCollection : liste et fiche ancrée" wide>
        {/* Contexte d'empilement local : le panneau superposé (< 1280 px) reste dans le cadre de la démonstration. */}
        <div className="relative min-h-[640px] overflow-hidden [transform:translateZ(0)]">
          <SpecCollection
            detailLabel="Fiche de la fonctionnalité"
            onCloseDetail={() => setSelected(null)}
            {...(selected ? { detail: <Detail /> } : {})}
            list={
              <ul
                aria-label="Fonctionnalités"
                className="m-0 list-none overflow-hidden rounded-xl border p-0"
              >
                {ROWS.map((row) => (
                  <li key={row.id} className="border-t first:border-t-0">
                    <Row
                      row={row}
                      selected={selected === row.id}
                      onOpen={() => setSelected(row.id)}
                    />
                  </li>
                ))}
              </ul>
            }
          />
        </div>
      </DevUiFrame>
      <DevUiFrame title="DeliverableStatus : Prêt, Génération, En cours, À valider, Validé">
        <div className="flex flex-wrap items-center gap-3">
          {STATUSES.map((status) => (
            <DeliverableStatus key={status} status={status} />
          ))}
        </div>
      </DevUiFrame>
      <DevUiFrame title="SpecNav : pastilles Prêt, N à relire, À valider">
        <div className="w-60">
          <SpecNav
            hrefs={HREFS}
            activeKey="functional"
            badges={{
              functional: { label: "3 à relire", tone: "primary" },
              data: { label: "Prêt", tone: "soft" },
            }}
          />
        </div>
      </DevUiFrame>
    </DevUiSection>
  );
}

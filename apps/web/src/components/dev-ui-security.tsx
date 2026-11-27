"use client";

import {
  Button,
  ChipFacts,
  ContextBanner,
  CoverageTable,
  DataClassificationTable,
  EntityChip,
  ExpectationBox,
  FactsPanel,
  GroupSection,
  IconList,
  InlineAlert,
  PermissionMatrix,
  Pill,
  QuestionCard,
  StatCard,
  SummaryCard,
  SummaryGrid,
  ThreatRow,
} from "@koklo/ui";

const noop = () => undefined;

/** Groupe de surface et lignes de menace : à traiter, proposée, traitée et à revoir. */
function ThreatSamples() {
  return (
    <GroupSection label="Fichier clients" tag="F-012" counts="3 menaces" countsAtEnd defaultOpen>
      <ThreatRow
        threatId="SEC-T08"
        title="Export du fichier clients par un compte volé"
        gravity="high"
        state="todo"
        current
      />
      <ThreatRow
        threatId="SEC-T09"
        title="Effacement incomplet"
        gravity="medium"
        state="proposed"
      />
      <ThreatRow threatId="SEC-T10" title="Clé exposée" gravity="low" state="stale" />
    </GroupSection>
  );
}

/** Fiche : parades et faits à puces. */
function FicheSample() {
  return (
    <>
      <IconList variant="shield" items={["Lien à usage unique.", "Empreinte seule en base."]} />
      <ChipFacts
        facts={[
          {
            label: "Fonctionnalité",
            children: <EntityChip variant="outline" kind="feature" id="F-012" />,
          },
          {
            label: "Touche",
            children: <EntityChip variant="outline" kind="table" id="clients" />,
          },
        ]}
      />
      <InlineAlert
        variant="warning"
        icon="warning"
        role="note"
        actions={[
          { label: "Proposer une parade", icon: "wand_stars", neutral: true, onClick: noop },
        ]}
      >
        Aucune parade écrite : cette menace bloque la validation.
      </InlineAlert>
      <Pill size="sm" tone="proposed">
        Proposée
      </Pill>
    </>
  );
}

function DataSample() {
  return (
    <>
      <ContextBanner
        icon="location_on"
        actions={
          <Button type="button" variant="outline" size="sm">
            Registre RGPD
          </Button>
        }
      >
        Hébergement : Paris · sous-traitants : à préciser.
      </ContextBanner>
      <DataClassificationTable
        rows={[
          {
            id: "reservations.note",
            name: "Note de rendez-vous",
            field: "reservations.note",
            category: "sensitive",
            retention: "À décider",
            access: "Coiffeuse du rendez-vous",
            protection: "—",
            pending: true,
          },
        ]}
        onAction={noop}
      />
    </>
  );
}

function RightsSample() {
  return (
    <>
      <PermissionMatrix
        variant="compact"
        roles={[
          { id: "RL-cliente", name: "Cliente" },
          { id: "RL-gerante", name: "Gérante" },
        ]}
        actions={[
          {
            id: "PM-reservation.lire",
            label: "Voir des rendez-vous",
            access: [{ level: "restricted", restriction: "Les siens" }, { level: "allowed" }],
          },
        ]}
      />
      <IconList variant="rule" items={["Une cliente n'accède qu'à ses rendez-vous."]} />
      <StatCard
        density="hero"
        label="Scénarios d'abus générés"
        value="14"
        note="Un par case « non » ou restreinte de la matrice."
      />
    </>
  );
}

function RequirementSample() {
  return (
    <>
      <CoverageTable
        rows={[
          {
            id: "access",
            name: "Contrôle d'accès",
            answered: 10,
            total: 11,
            where: "Matrice des droits",
            status: "missing",
          },
        ]}
      />
      <FactsPanel
        title="Secrets et dépendances"
        facts={[{ label: "Rotation", value: "Tous les 90 jours." }]}
      />
      <FactsPanel title="Une pull request ne fusionne pas si…">
        <IconList variant="block" items={["un secret apparaît dans le code ;"]} />
      </FactsPanel>
    </>
  );
}

function SummarySample() {
  return (
    <>
      <SummaryGrid>
        <SummaryCard icon="location_on" title="Où sont les données">
          À Paris.
        </SummaryCard>
        <SummaryCard icon="campaign" title="En cas d'incident" wide>
          Nous vous prévenons sous 24 heures.
        </SummaryCard>
      </SummaryGrid>
      <ExpectationBox pending title="Ce que nous attendons de vous">
        Le nom et le téléphone de la personne à prévenir.
      </ExpectationBox>
      <QuestionCard
        autoFocus={false}
        title="Votre question à l'équipe"
        value=""
        onChange={noop}
        onSend={noop}
        onCancel={noop}
      />
    </>
  );
}

/** Composants de la Sécurité (DESIGN.md §5.28). */
export function SecurityGallery() {
  return (
    <section aria-labelledby="gallery-security" className="flex min-w-0 flex-col gap-4">
      <h2 id="gallery-security" className="text-section-title">
        Sécurité
      </h2>
      <ThreatSamples />
      <FicheSample />
      <DataSample />
      <RightsSample />
      <RequirementSample />
      <SummarySample />
    </section>
  );
}

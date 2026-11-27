"use client";

import type { ThreatDetail } from "@koklo/contract";
import {
  Button,
  ChipFacts,
  ContextBanner,
  EntityChip,
  type EntityKind,
  Icon,
  IconList,
  type IconName,
  InlineAlert,
  LabeledNote,
  Pill,
  SegmentedControl,
  THREAT_GRAVITY_PILL,
  ThreatFicheTitle,
} from "@koklo/ui";
import { useState } from "react";
import {
  ALL_SURFACES,
  FICHE_VIEWS,
  GENERATED_SCENARIO,
  MEASURES_LABEL,
  noScenarioText,
  PROPOSE_MEASURE,
  THREAT_CATEGORY_LABELS,
  TODO_TEXT,
  verificationSentence,
  WHAT_LABEL,
} from "../lib/security-labels.ts";
import { useThreatDetail } from "../lib/use-security-data.ts";
import { SourceBlock } from "./data-diagram-source.tsx";
import { SecurityRead } from "./security-empty.tsx";

type View = (typeof FICHE_VIEWS)[number]["value"];

const PREFIXES: ReadonlyArray<[prefix: string, kind: EntityKind, icon?: IconName]> = [
  ["T-", "table", "table_chart"],
  ["RL-", "role", "admin_panel_settings"],
  ["NFR-", "nfr"],
  ["ST-", "component", "terminal"],
  ["ENV-", "component", "dns"],
  ["S-", "screen"],
  ["R-", "rule", "rule"],
];

/** Genre d'un lien : par préfixe ; « a.b » est un champ quand `a` est une table connue, sinon une opération. */
function kindOf(link: string, tables: ReadonlySet<string>): [EntityKind, IconName?] {
  const found = PREFIXES.find(([prefix]) => link.startsWith(prefix));
  if (found) return [found[1], found[2]];
  return tables.has(link.split(".")[0] ?? "") ? ["table", "table_chart"] : ["endpoint"];
}

function Facts({ threat, tables }: { threat: ThreatDetail; tables: ReadonlySet<string> }) {
  const surfaces = threat.surfaces.map((surface) =>
    surface === "api" ? (
      <EntityChip key={surface} variant="outline" kind="feature" id="" title={ALL_SURFACES} />
    ) : (
      <EntityChip key={surface} variant="outline" kind="feature" id={surface} />
    ),
  );
  const links = threat.links.map((link) => {
    const [kind, icon] = kindOf(link, tables);
    return (
      <EntityChip key={link} variant="outline" kind={kind} id={link} {...(icon ? { icon } : {})} />
    );
  });
  return (
    <ChipFacts
      facts={[
        { label: "Fonctionnalité", children: surfaces },
        ...(links.length > 0 ? [{ label: "Touche", children: links }] : []),
      ]}
    />
  );
}

/** Menace élevée sans parade : encadré ambre et, pour qui écrit, « Proposer une parade ». */
function Unprotected({
  id,
  onPropose,
}: {
  id: string;
  onPropose: ((id: string) => void) | undefined;
}) {
  const common = { variant: "warning", icon: "warning", role: "note" } as const;
  if (!onPropose) return <InlineAlert {...common}>{TODO_TEXT}</InlineAlert>;
  return (
    <InlineAlert
      {...common}
      actions={[
        {
          label: PROPOSE_MEASURE,
          icon: "wand_stars",
          neutral: true,
          onClick: () => onPropose(id),
        },
      ]}
      className="[&>div]:flex-wrap"
    >
      {TODO_TEXT}
    </InlineAlert>
  );
}

/** « Fiche » : ce qui peut arriver, encadré d'une menace élevée sans parade, parades, liens et vérification. */
function Sheet({
  threat,
  tables,
  onPropose,
}: {
  threat: ThreatDetail;
  tables: ReadonlySet<string>;
  onPropose: ((id: string) => void) | undefined;
}) {
  const todo = threat.status === "todo";
  return (
    <>
      <LabeledNote label={WHAT_LABEL}>{threat.risk}</LabeledNote>
      {todo && threat.severity === "high" ? (
        <Unprotected id={threat.id} onPropose={onPropose} />
      ) : null}
      {threat.measures.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <h3 className="m-0 text-subsection-title uppercase tracking-wider text-muted-foreground">
            {MEASURES_LABEL}
          </h3>
          <IconList variant="shield" items={threat.measures} />
        </div>
      ) : null}
      <Facts threat={threat} tables={tables} />
      <ContextBanner icon={todo ? "radio_button_unchecked" : "verified"} variant="outline">
        {verificationSentence(threat)}
      </ContextBanner>
    </>
  );
}

/** « Scénario d'abus » : le Gherkin généré, ou la mention de ce qui vérifie la menace à sa place. */
function Scenario({ threat }: { threat: ThreatDetail }) {
  const generated = threat.verification === "scenario";
  return (
    <SourceBlock
      icon="description"
      path={threat.scenarioPath ?? threat.filePath}
      label={`Scénario d'abus de ${threat.id}`}
      code={generated ? threat.gherkin : noScenarioText(threat)}
      tag={
        generated ? (
          <Pill size="sm" tone="soft">
            {GENERATED_SCENARIO}
          </Pill>
        ) : null
      }
    />
  );
}

function Content({
  threat,
  tables,
  onEdit,
  onPropose,
}: {
  threat: ThreatDetail;
  tables: ReadonlySet<string>;
  onEdit: (() => void) | undefined;
  onPropose: ((id: string) => void) | undefined;
}) {
  const [view, setView] = useState<View>("fiche");
  const grave = THREAT_GRAVITY_PILL[threat.severity];
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Pill size="sm" tone="soft">
          {THREAT_CATEGORY_LABELS[threat.category]}
        </Pill>
        <Pill size="sm" tone={grave.tone}>
          Gravité {grave.label.toLowerCase()}
        </Pill>
        <span className="font-mono text-code font-normal text-muted-foreground">{threat.id}</span>
        <span className="flex-1" />
        {onEdit ? (
          <Button type="button" variant="ghost" size="sm" className="max-md:h-11" onClick={onEdit}>
            <Icon name="edit" size={16} />
            Modifier
          </Button>
        ) : null}
      </div>
      <ThreatFicheTitle>{threat.title}</ThreatFicheTitle>
      <SegmentedControl
        aria-label="Vue"
        options={FICHE_VIEWS}
        value={view}
        onValueChange={setView}
        className="self-start max-md:[&>button]:h-11"
      />
      {view === "fiche" ? (
        <Sheet threat={threat} tables={tables} onPropose={onPropose} />
      ) : (
        <Scenario threat={threat} />
      )}
    </>
  );
}

/** Fiche d'une menace (maquette 15 l.137-154), lue par `security.threat.byId`. */
export function ThreatFiche({
  projectId,
  threatId,
  ...actions
}: {
  projectId: string;
  threatId: string;
  tables: ReadonlySet<string>;
  onEdit: (() => void) | undefined;
  onPropose: ((id: string) => void) | undefined;
}) {
  const query = useThreatDetail(projectId, threatId);
  return (
    <SecurityRead query={query}>
      {(threat) => <Content threat={threat as ThreatDetail} {...actions} />}
    </SecurityRead>
  );
}

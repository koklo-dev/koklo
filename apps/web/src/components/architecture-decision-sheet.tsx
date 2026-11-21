"use client";

import type { SpecItem } from "@koklo/contract";
import {
  ADR_STATUS_OPTIONS,
  type AdrValues,
  adrIssues,
  adrLinkTag,
  adrOperationOf,
  adrValuesOf,
  EMPTY_ADR,
} from "../lib/architecture-decision.ts";
import { AreaField, ChoiceField, TagsField, TextField } from "./domain-form-fields.tsx";
import {
  type DomainFormConfig,
  type DomainFormProps,
  DomainFormSheet,
  type FieldsContext,
} from "./domain-form-sheet.tsx";

type Detail = Extract<SpecItem, { type: "adr" }>["values"];

function Identity({ values, set, issues, readOnly }: FieldsContext<AdrValues>) {
  const common = { issues, readOnly };
  return (
    <>
      <TextField
        {...common}
        field="title"
        label="Titre"
        required
        value={values.title}
        maxLength={200}
        hint="Formulé comme un choix : « X plutôt que Y »."
        onChange={(title) => set({ title })}
      />
      <ChoiceField
        {...common}
        field="status"
        label="Statut"
        required
        value={values.status}
        options={ADR_STATUS_OPTIONS}
        onChange={(status) => set({ status })}
      />
      {values.status === "remplacee" ? (
        <TextField
          {...common}
          field="supersededBy"
          label="Remplacée par"
          required
          value={values.supersededBy}
          maxLength={20}
          placeholder="ADR-003"
          onChange={(supersededBy) => set({ supersededBy })}
        />
      ) : null}
    </>
  );
}

/** Contexte et décision (obligatoires), puis les champs facultatifs. */
function Body(context: FieldsContext<AdrValues>) {
  const { values, set, issues, readOnly } = context;
  const common = { issues, readOnly };
  return (
    <>
      <AreaField
        {...common}
        field="context"
        label="Contexte"
        required
        rows={3}
        value={values.context}
        hint="Le problème et ses contraintes."
        onChange={(context) => set({ context })}
      />
      <AreaField
        {...common}
        field="decision"
        label="Décision"
        required
        rows={3}
        value={values.decision}
        onChange={(decision) => set({ decision })}
      />
      <Optional {...context} />
    </>
  );
}

/** Conséquences, alternatives et liens (champs facultatifs). */
function Optional({ values, set, issues, readOnly }: FieldsContext<AdrValues>) {
  const common = { issues, readOnly };
  return (
    <>
      <AreaField
        {...common}
        field="positives"
        label="Conséquences positives"
        optional
        rows={2}
        value={values.positives}
        onChange={(positives) => set({ positives })}
      />
      <AreaField
        {...common}
        field="accepted"
        label="À accepter"
        optional
        rows={2}
        value={values.accepted}
        onChange={(accepted) => set({ accepted })}
      />
      <AreaField
        {...common}
        field="alternatives"
        label="Alternatives écartées"
        optional
        rows={2}
        value={values.alternatives}
        hint="Une par ligne : nom · raison."
        onChange={(alternatives) => set({ alternatives })}
      />
      <TagsField
        {...common}
        field="links"
        label="Liens"
        optional
        value={values.links}
        hint="Composants, exigences, règles."
        placeholder="C-api"
        validate={adrLinkTag}
        onChange={(links) => set({ links })}
      />
    </>
  );
}

const CONFIG: DomainFormConfig<AdrValues, "adr", Detail> = {
  type: "adr",
  section: "Architecture",
  icon: "gavel",
  noun: {
    create: "Nouvelle décision",
    edit: "Modifier la décision",
    loading: "Chargement de la décision…",
  },
  bodyLabel: "Saisie de la décision",
  newFile: "architecture/adr/ADR-024-titre.md",
  conflict: "Une décision existe déjà avec ce numéro.",
  empty: EMPTY_ADR,
  valuesOf: adrValuesOf,
  issuesOf: adrIssues,
  operationOf: adrOperationOf,
  titleOf: (values) => values.title.trim(),
  labels: {
    title: "Titre",
    status: "Statut",
    supersededBy: "Remplacée par",
    context: "Contexte",
    decision: "Décision",
    positives: "Conséquences positives",
    accepted: "À accepter",
    alternatives: "Alternatives écartées",
    links: "Liens",
  },
  fields: (context) => (
    <>
      <Identity {...context} />
      <Body {...context} />
    </>
  ),
};

/** Formulaire Décision (B586) : Titre, Statut, « Remplacée par », Contexte, Décision, Conséquences, Alternatives, Liens. */
export function ArchitectureDecisionSheet(props: DomainFormProps) {
  return <DomainFormSheet props={props} config={CONFIG} />;
}

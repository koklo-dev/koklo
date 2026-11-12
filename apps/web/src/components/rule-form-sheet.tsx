"use client";

import type { RuleDetail } from "@koklo/contract";
import {
  EMPTY_RULE,
  type RuleKind,
  type RuleValues,
  ruleIssues,
  ruleOperationOf,
  ruleValuesOf,
} from "../lib/domain-operations.ts";
import { AreaField, ChoiceField, TagsField, TextField } from "./domain-form-fields.tsx";
import {
  type DomainFormConfig,
  type DomainFormProps,
  DomainFormSheet,
  type FieldsContext,
} from "./domain-form-sheet.tsx";

const TYPES: ReadonlyArray<{ value: RuleKind; label: string }> = [
  { value: "contrainte", label: "Contrainte" },
  { value: "calcul", label: "Calcul" },
  { value: "workflow", label: "Workflow à états" },
];

const featureTag = (tag: string): string | null =>
  /^F-\d{3,}$/.test(tag) ? null : `« ${tag} » n'est pas une fonctionnalité (exemple : F-001).`;

function RuleHead({ values, set, issues, readOnly }: FieldsContext<RuleValues>) {
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
        onChange={(title) => set({ title })}
      />
      <ChoiceField
        {...common}
        field="type"
        label="Type"
        required
        value={values.type}
        options={TYPES}
        onChange={(type) => set({ type })}
      />
      {values.type === "workflow" ? (
        <TagsField
          {...common}
          field="states"
          label="États"
          required
          value={values.states}
          placeholder="Un état, puis Entrée"
          hint="Le premier est l'état initial ; les suivants se lisent dans l'ordre."
          onChange={(states) => set({ states })}
        />
      ) : null}
    </>
  );
}

function RuleBody({ projectId, values, set, issues, readOnly }: FieldsContext<RuleValues>) {
  const common = { issues, readOnly };
  return (
    <>
      <AreaField
        {...common}
        field="statement"
        label="Énoncé"
        required
        rows={3}
        value={values.statement}
        hint="Une vérité du domaine que le produit doit toujours respecter."
        onChange={(statement) => set({ statement })}
      />
      <AreaField
        {...common}
        field="example"
        label="Exemple"
        optional
        rows={2}
        value={values.example}
        hint="Un cas concret, avec des valeurs."
        onChange={(example) => set({ example })}
      />
      <TagsField
        {...common}
        field="features"
        label="Appliquée par"
        optional
        value={values.features}
        hint="Fonctionnalités."
        projectId={projectId}
        kinds={["feature"]}
        validate={featureTag}
        onChange={(features) => set({ features })}
      />
    </>
  );
}

function RuleFields(context: FieldsContext<RuleValues>) {
  return (
    <>
      <RuleHead {...context} />
      <RuleBody {...context} />
    </>
  );
}

const CONFIG: DomainFormConfig<RuleValues, "rule", RuleDetail> = {
  type: "rule",
  icon: "gavel",
  noun: { create: "Nouvelle règle", edit: "Modifier la règle", loading: "Chargement de la règle…" },
  bodyLabel: "Saisie de la règle",
  newFile: "domain/rules/R-nnn-titre.md",
  conflict: "Une règle de ce titre existe déjà.",
  empty: EMPTY_RULE,
  valuesOf: ruleValuesOf,
  issuesOf: ruleIssues,
  operationOf: ruleOperationOf,
  titleOf: (values) => values.title.trim(),
  labels: {
    title: "Titre",
    type: "Type",
    states: "États",
    statement: "Énoncé",
    example: "Exemple",
    features: "Appliquée par",
  },
  fields: RuleFields,
};

/** Formulaire Règle (11 §3) : Titre*, Type*, États (workflow), Énoncé*, Exemple, Appliquée par. */
export function RuleFormSheet(props: DomainFormProps) {
  return <DomainFormSheet props={props} config={CONFIG} />;
}

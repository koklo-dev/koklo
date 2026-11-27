"use client";

import type { SpecItem } from "@koklo/contract";
import { STACK_STATUS_PILL } from "@koklo/ui";
import {
  EMPTY_STACK,
  type StackValues,
  stackIssues,
  stackOperationOf,
  stackValuesOf,
} from "../lib/technical-operations.ts";
import { AreaField, ChoiceField, TagsField, TextField } from "./domain-form-fields.tsx";
import {
  type DomainFormConfig,
  type DomainFormProps,
  DomainFormSheet,
  type FieldsContext,
} from "./domain-form-sheet.tsx";

type Detail = Extract<SpecItem, { type: "stack" }>["values"];

const STATUSES = [
  { value: "chosen", label: STACK_STATUS_PILL.chosen.label },
  { value: "open", label: STACK_STATUS_PILL.open.label },
] as const;

const componentTag = (tag: string): string | null =>
  /^C-[a-z0-9][a-z0-9-]*$/.test(tag) ? null : `« ${tag} » n'est pas un composant (ex. C-api).`;
const requirementTag = (tag: string): string | null =>
  /^NFR-[a-z0-9][a-z0-9-]*$/.test(tag) ? null : `« ${tag} » n'est pas une exigence (ex. NFR-001).`;

function Choice({ projectId, values, set, issues, readOnly, filled }: FieldsContext<StackValues>) {
  const common = { issues, readOnly };
  const mark = (field: string) => ({ field, agentFilled: filled.has(field) });
  return (
    <>
      <TextField
        {...common}
        {...mark("role")}
        label="Rôle"
        required
        value={values.role}
        maxLength={120}
        hint="Un rôle de l'architecture."
        onChange={(role) => set({ role })}
      />
      <TagsField
        {...common}
        {...mark("components")}
        label="Composants concernés"
        required
        value={values.components}
        projectId={projectId}
        kinds={["component"]}
        validate={componentTag}
        placeholder="Ajouter…"
        onChange={(components) => set({ components })}
      />
      <ChoiceField
        {...common}
        {...mark("status")}
        label="Statut"
        required
        value={values.status}
        options={STATUSES}
        onChange={(status) => set({ status })}
      />
      <TextField
        {...common}
        {...mark("choice")}
        label="Choix retenu"
        value={values.choice}
        maxLength={200}
        hint="Vide tant que le choix est à trancher."
        onChange={(choice) => set({ choice })}
      />
    </>
  );
}

function Comparison({
  projectId,
  values,
  set,
  issues,
  readOnly,
  filled,
}: FieldsContext<StackValues>) {
  const common = { issues, readOnly };
  const mark = (field: string) => ({ field, agentFilled: filled.has(field) });
  return (
    <>
      <TagsField
        {...common}
        {...mark("options")}
        label="Options comparées"
        required
        value={values.options}
        hint="Deux options au moins."
        placeholder="Ajouter…"
        onChange={(options) => set({ options })}
      />
      <TagsField
        {...common}
        {...mark("criteria")}
        label="Critères"
        required
        value={values.criteria}
        hint="Chaque option est notée sur chaque critère."
        placeholder="Ajouter…"
        onChange={(criteria) => set({ criteria })}
      />
      <AreaField
        {...common}
        {...mark("why")}
        label="Pourquoi"
        required
        rows={3}
        value={values.why}
        onChange={(why) => set({ why })}
      />
      <TagsField
        {...common}
        {...mark("requirements")}
        label="Exigences visées"
        value={values.requirements}
        projectId={projectId}
        kinds={["nfr"]}
        validate={requirementTag}
        placeholder="Ajouter…"
        onChange={(requirements) => set({ requirements })}
      />
    </>
  );
}

function StackFields(context: FieldsContext<StackValues>) {
  return (
    <>
      <Choice {...context} />
      <Comparison {...context} />
    </>
  );
}

const CONFIG: DomainFormConfig<StackValues, "stack", Detail> = {
  type: "stack",
  section: "Technique",
  icon: "layers",
  noun: {
    create: "Nouveau choix technique",
    edit: "Modifier le choix technique",
    loading: "Chargement du choix technique…",
  },
  bodyLabel: "Saisie du choix technique",
  newFile: "tech/stack/nom.yaml",
  conflict: "Un choix de ce rôle existe déjà.",
  empty: EMPTY_STACK,
  valuesOf: stackValuesOf,
  issuesOf: stackIssues,
  operationOf: stackOperationOf,
  titleOf: (values) => values.role.trim(),
  labels: {
    role: "Rôle",
    components: "Composants concernés",
    status: "Statut",
    choice: "Choix retenu",
    options: "Options comparées",
    criteria: "Critères",
    why: "Pourquoi",
    requirements: "Exigences visées",
  },
  fields: StackFields,
  assist: {
    type: "stack",
    hint: "ex. « choisis un outil de génération de PDF pour les factures »",
    missing: "Décrivez d'abord le choix technique en une phrase.",
  },
};

/** Feuille « Choix technique » (maquette 14 l.427-479, 888-892). */
export function TechnicalStackSheet(props: DomainFormProps) {
  return <DomainFormSheet props={props} config={CONFIG} />;
}

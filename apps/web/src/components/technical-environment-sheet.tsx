"use client";

import type { SpecItem } from "@koklo/contract";
import { DATA_LABELS, DEPLOYMENT_LABELS } from "../lib/technical-labels.ts";
import {
  EMPTY_ENVIRONMENT,
  type EnvironmentValues,
  environmentIssues,
  environmentOperationOf,
  environmentValuesOf,
} from "../lib/technical-operations.ts";
import { ChoiceField, SelectField, TextField } from "./domain-form-fields.tsx";
import {
  type DomainFormConfig,
  type DomainFormProps,
  DomainFormSheet,
  type FieldsContext,
} from "./domain-form-sheet.tsx";

type Detail = Extract<SpecItem, { type: "environment" }>["values"];

const optionsOf = <V extends string>(labels: Record<V, string>) =>
  (Object.keys(labels) as V[]).map((value) => ({ value, label: labels[value] }));

const TEXTS = [
  { field: "name", label: "Nom", max: 120 },
  { field: "address", label: "Adresse", max: 200 },
  { field: "hosting", label: "Hébergement", max: 200 },
  { field: "database", label: "Base", max: 200 },
] as const;

function EnvironmentFields({
  values,
  set,
  issues,
  readOnly,
  filled,
}: FieldsContext<EnvironmentValues>) {
  const common = { issues, readOnly };
  const mark = (field: string) => ({ field, agentFilled: filled.has(field) });
  return (
    <>
      {TEXTS.map(({ field, label, max }) => (
        <TextField
          key={field}
          {...common}
          {...mark(field)}
          label={label}
          required
          value={values[field]}
          maxLength={max}
          onChange={(value) => set({ [field]: value })}
        />
      ))}
      <ChoiceField
        {...common}
        {...mark("data")}
        label="Données"
        required
        value={values.data}
        options={optionsOf(DATA_LABELS)}
        onChange={(data) => set({ data })}
      />
      <SelectField
        {...common}
        {...mark("deployment")}
        label="Déploiement"
        required
        value={values.deployment}
        options={optionsOf(DEPLOYMENT_LABELS)}
        onChange={(deployment) => set({ deployment })}
      />
      <TextField
        {...common}
        {...mark("access")}
        label="Accès"
        value={values.access}
        maxLength={200}
        onChange={(access) => set({ access })}
      />
    </>
  );
}

const CONFIG: DomainFormConfig<EnvironmentValues, "environment", Detail> = {
  type: "environment",
  deleteKind: "env.delete",
  section: "Technique",
  icon: "dns",
  noun: {
    create: "Nouvel environnement",
    edit: "Modifier l'environnement",
    loading: "Chargement de l'environnement…",
  },
  bodyLabel: "Saisie de l'environnement",
  newFile: "tech/environments.yaml",
  conflict: "Un environnement de ce nom existe déjà.",
  empty: EMPTY_ENVIRONMENT,
  valuesOf: environmentValuesOf,
  issuesOf: environmentIssues,
  operationOf: environmentOperationOf,
  titleOf: (values) => values.name.trim(),
  labels: {
    name: "Nom",
    address: "Adresse",
    hosting: "Hébergement",
    database: "Base",
    data: "Données",
    deployment: "Déploiement",
    access: "Accès",
  },
  fields: EnvironmentFields,
  assist: {
    type: "environment",
    hint: "ex. « un environnement de démonstration pour les prospects »",
    missing: "Décrivez d'abord l'environnement en une phrase.",
  },
};

/** Feuille « Environnement » (maquette 14 l.427-479, 903-907) : jamais de valeur de variable. */
export function TechnicalEnvironmentSheet(props: DomainFormProps) {
  return <DomainFormSheet props={props} config={CONFIG} />;
}

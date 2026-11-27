"use client";

import type { SecurityDataEntryDetail } from "@koklo/contract";
import { useMemo } from "react";
import {
  DATA_CATEGORY_OPTIONS,
  EMPTY_SENSITIVE,
  needsRetention,
  type SensitiveValues,
  sensitiveIssues,
  sensitiveOperationOf,
  sensitivePrefillValues,
  sensitiveValuesOf,
} from "../lib/security-operations.ts";
import { AreaField, ChoiceField, TagsField, TextField } from "./domain-form-fields.tsx";
import {
  type DomainFormConfig,
  type DomainFormProps,
  DomainFormSheet,
  type FieldsContext,
} from "./domain-form-sheet.tsx";

type Context = FieldsContext<SensitiveValues>;

const common = ({ issues, readOnly, filled }: Context, field: string) => ({
  field,
  issues,
  readOnly,
  agentFilled: filled.has(field),
});

function Identity(context: Context) {
  const { values, set } = context;
  return (
    <>
      <TextField
        {...common(context, "data")}
        label="Donnée"
        required
        value={values.data}
        maxLength={200}
        hint="Ce que la donnée est, en mots simples."
        onChange={(data) => set({ data })}
      />
      <TextField
        {...common(context, "fields")}
        label="Champ"
        required
        mono
        value={values.fields}
        hint="table.champ du modèle de données"
        onChange={(fields) => set({ fields })}
      />
      <ChoiceField
        {...common(context, "category")}
        label="Catégorie"
        required
        value={values.category}
        options={DATA_CATEGORY_OPTIONS}
        onChange={(category) => set({ category })}
      />
    </>
  );
}

/** Conservation saisie par un humain (A7) : la suggestion de l'agent n'est qu'une aide sous le champ. */
function Keeping(context: Context) {
  const { values, set } = context;
  return (
    <>
      <TextField
        {...common(context, "retention")}
        label="Conservation"
        required={needsRetention(values.category)}
        value={values.retention}
        maxLength={300}
        hint={
          <>
            Une durée, et à partir de quand.
            {values.suggestion ? (
              <span className="block">{`Proposée par l'agent : ${values.suggestion}`}</span>
            ) : null}
          </>
        }
        onChange={(retention) => set({ retention })}
      />
      <TagsField
        {...common(context, "access")}
        label="Qui y accède"
        required
        value={values.access}
        hint="Rôles de la matrice des droits."
        placeholder="Ajouter…"
        onChange={(access) => set({ access })}
      />
      <AreaField
        {...common(context, "protection")}
        label="Protection"
        rows={2}
        value={values.protection}
        onChange={(protection) => set({ protection })}
      />
    </>
  );
}

function SensitiveFields(context: Context) {
  return (
    <>
      <Identity {...context} />
      <Keeping {...context} />
    </>
  );
}

const CONFIG: DomainFormConfig<SensitiveValues, "sensitive", SecurityDataEntryDetail> = {
  type: "sensitive",
  section: "Sécurité",
  icon: "badge",
  noun: {
    create: "Nouvelle donnée",
    edit: "Modifier la donnée",
    loading: "Chargement de la donnée…",
  },
  bodyLabel: "Saisie de la donnée",
  newFile: "security/data.yaml",
  conflict: "Ce champ est déjà classé dans une autre entrée.",
  empty: EMPTY_SENSITIVE,
  valuesOf: sensitiveValuesOf,
  issuesOf: sensitiveIssues,
  operationOf: sensitiveOperationOf,
  titleOf: (values) => values.data.trim(),
  labels: {
    data: "Donnée",
    fields: "Champ",
    category: "Catégorie",
    retention: "Conservation",
    access: "Qui y accède",
    protection: "Protection",
  },
  fields: SensitiveFields,
  assist: {
    type: "sensitive",
    hint: "ex. « une photo du résultat, prise par la coiffeuse »",
    missing: "Décrivez d'abord la donnée en une phrase.",
    toValues: sensitivePrefillValues,
  },
};

/** Feuille « Donnée » (maquette 15 l.711-715) ; `field` : champ à classer, déjà écrit à la création. */
export function SecuritySensitiveSheet({
  field,
  ...props
}: DomainFormProps & { field?: string | undefined }) {
  const config = useMemo(
    () => ({ ...CONFIG, empty: { ...EMPTY_SENSITIVE, fields: field ?? "" } }),
    [field],
  );
  return <DomainFormSheet props={props} config={config} />;
}

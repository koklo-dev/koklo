"use client";

import type { SpecItem } from "@koklo/contract";
import { useQuery } from "@tanstack/react-query";
import { orpc } from "../lib/orpc.ts";
import {
  EMPTY_TABLE,
  type TableValues,
  tableIssues,
  tableOperationOf,
  tableValuesOf,
} from "../lib/table-operations.ts";
import { AreaField, ChoiceField, TagsField, TextField } from "./domain-form-fields.tsx";
import {
  type DomainFormConfig,
  type DomainFormProps,
  DomainFormSheet,
  type FieldsContext,
} from "./domain-form-sheet.tsx";

type Detail = Extract<SpecItem, { type: "table" }>["values"];

const PERSONAL = [
  { value: "no", label: "Non" },
  { value: "yes", label: "Oui" },
] as const;

const FIELDS_HINT =
  "Un par ligne : nom · type · contrainte. Types : uuid, texte(n), entier, decimal, booleen, horodatage, date, enum, ref(T-…). Ajoutez « clé primaire » ou « données personnelles » à une ligne.";

const SUMMARY_HINT =
  "Ce que le client lit sur cette table. Une phrase par ligne, sans mot technique.";

const sourceTag = (tag: string): string | null =>
  /^(F|R)-\d{3,}$/.test(tag)
    ? null
    : `« ${tag} » n'est ni une fonctionnalité ni une règle (exemples : F-001, R-004).`;

/** Zones déjà utilisées par les tables : proposées à la saisie, jamais imposées (une zone nouvelle reste permise). */
function useZones(projectId: string): string[] {
  const query = useQuery(
    orpc.spec.data.tables.list.queryOptions({ input: { projectId, limit: 1 } }),
  );
  return Object.keys(query.data?.facets?.zone ?? {});
}

function TableIdentity({ projectId, values, set, issues, readOnly }: FieldsContext<TableValues>) {
  const common = { issues, readOnly };
  const zones = useZones(projectId);
  return (
    <>
      <TextField
        {...common}
        field="name"
        label="Nom"
        required
        value={values.name}
        maxLength={120}
        hint="L'identifiant T-… se déduit du nom à l'enregistrement."
        onChange={(name) => set({ name })}
      />
      <TextField
        {...common}
        field="zone"
        label="Zone"
        required
        value={values.zone}
        maxLength={80}
        suggestions={zones}
        placeholder="ex. Prise de rendez-vous"
        onChange={(zone) => set({ zone })}
      />
      <AreaField
        {...common}
        field="description"
        label="Description"
        optional
        rows={2}
        value={values.description}
        onChange={(description) => set({ description })}
      />
      <AreaField
        {...common}
        field="clientSummary"
        label="Ce qu'on enregistre"
        optional
        rows={3}
        value={values.clientSummaryText}
        hint={SUMMARY_HINT}
        onChange={(clientSummaryText) => set({ clientSummaryText })}
      />
    </>
  );
}

function TableContent({ projectId, values, set, issues, readOnly }: FieldsContext<TableValues>) {
  const common = { issues, readOnly };
  return (
    <>
      <AreaField
        {...common}
        field="fields"
        label="Champs"
        required
        rows={5}
        value={values.fieldsText}
        hint={FIELDS_HINT}
        onChange={(fieldsText) => set({ fieldsText })}
      />
      <ChoiceField
        {...common}
        field="personal"
        label="Données personnelles"
        required
        value={values.personal}
        options={PERSONAL}
        hint="Reliées à NFR-001 si oui."
        onChange={(personal) => set({ personal })}
      />
      <TagsField
        {...common}
        field="sources"
        label="Justifiée par"
        optional
        value={values.sources}
        hint="Fonctionnalités, règles."
        projectId={projectId}
        kinds={["feature", "rule"]}
        validate={sourceTag}
        onChange={(sources) => set({ sources })}
      />
    </>
  );
}

function TableFields(context: FieldsContext<TableValues>) {
  return (
    <>
      <TableIdentity {...context} />
      <TableContent {...context} />
    </>
  );
}

const CONFIG: DomainFormConfig<TableValues, "table", Detail> = {
  type: "table",
  section: "Données",
  icon: "table",
  noun: {
    create: "Nouvelle table",
    edit: "Modifier la table",
    loading: "Chargement de la table…",
  },
  bodyLabel: "Saisie de la table",
  newFile: "data/tables/nom.yaml",
  conflict: "Une table de ce nom existe déjà.",
  empty: EMPTY_TABLE,
  valuesOf: tableValuesOf,
  issuesOf: tableIssues,
  operationOf: tableOperationOf,
  titleOf: (values) => values.name.trim(),
  labels: {
    name: "Nom",
    zone: "Zone",
    description: "Description",
    clientSummary: "Ce qu'on enregistre",
    fields: "Champs",
    personal: "Données personnelles",
    sources: "Justifiée par",
  },
  fields: TableFields,
};

/** Formulaire Table (11 §3) : Nom*, Zone*, Description, Champs*, Données personnelles*, Justifiée par. */
export function TableFormSheet(props: DomainFormProps) {
  return <DomainFormSheet props={props} config={CONFIG} />;
}

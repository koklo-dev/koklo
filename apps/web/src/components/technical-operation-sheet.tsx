"use client";

import type { OperationDetail } from "@koklo/contract";
import {
  EMPTY_OPERATION,
  type OperationValues,
  operationIssues,
  operationOperationOf,
  operationPrefillValues,
  operationValuesOf,
} from "../lib/technical-api-forms.ts";
import { useOperationOptions } from "../lib/use-technical-api.ts";
import {
  AreaField,
  ChoiceField,
  SelectField,
  TagsField,
  TextField,
} from "./domain-form-fields.tsx";
import {
  type DomainFormConfig,
  type DomainFormProps,
  DomainFormSheet,
  type FieldsContext,
} from "./domain-form-sheet.tsx";

type Context = FieldsContext<OperationValues>;

const TYPES = [
  { value: "read", label: "Lecture" },
  { value: "write", label: "Écriture" },
  { value: "internal", label: "Interne" },
] as const;

const OPEN_PERMISSIONS = [
  { value: "public", label: "public" },
  { value: "internal", label: "interne" },
];

const linkTag = (tag: string): string | null =>
  /^[RF]-\d{3,}$/.test(tag) ? null : `« ${tag} » n'est ni une règle ni une fonctionnalité.`;

/** Valeurs proposées, avec la valeur saisie ou lue même quand la liste ne la connaît pas. */
function optionsOf(known: ReadonlyArray<{ value: string; label: string }>, current: string) {
  if (!current || known.some((option) => option.value === current)) return known;
  return [...known, { value: current, label: current }];
}

const common = ({ issues, readOnly, filled }: Context, field: string) => ({
  field,
  issues,
  readOnly,
  agentFilled: filled.has(field),
});

/** Zone : liste des zones connues (B773) ; saisie libre tant qu'aucune n'existe. */
function Zone({ context }: { context: Context }) {
  const options = useOperationOptions(context.projectId);
  const { values, set } = context;
  const zones = (options.data?.zones ?? []).map((zone) => ({ value: zone, label: zone }));
  const shared = { ...common(context, "zone"), label: "Zone", required: true, value: values.zone };
  const onChange = (zone: string) => set({ zone });
  if (options.data && zones.length === 0) {
    return <TextField {...shared} maxLength={80} onChange={onChange} />;
  }
  return <SelectField {...shared} options={optionsOf(zones, values.zone)} onChange={onChange} />;
}

function Permission({ context }: { context: Context }) {
  const options = useOperationOptions(context.projectId);
  const { values, set } = context;
  const roles = (options.data?.permissions ?? []).map((id) => ({ value: id, label: id }));
  return (
    <SelectField
      {...common(context, "permission")}
      label="Permission"
      required
      value={values.permission}
      options={optionsOf([...OPEN_PERMISSIONS, ...roles], values.permission)}
      onChange={(permission) => set({ permission })}
    />
  );
}

function Identity(context: Context) {
  const { values, set, editing } = context;
  return (
    <>
      <TextField
        {...common(context, "name")}
        label="Nom"
        required
        mono
        locked={editing}
        value={values.name}
        maxLength={120}
        hint="zone.verbe, ex. avis.create"
        onChange={(name) => set({ name })}
      />
      <ChoiceField
        {...common(context, "type")}
        label="Type"
        required
        value={values.type}
        options={TYPES}
        onChange={(type) => set({ type })}
      />
      <Zone context={context} />
      <TextField
        {...common(context, "summary")}
        label="Résumé"
        required
        value={values.summary}
        maxLength={500}
        onChange={(summary) => set({ summary })}
      />
      <Permission context={context} />
    </>
  );
}

function Contract(context: Context) {
  const { projectId, values, set } = context;
  return (
    <>
      <AreaField
        {...common(context, "input")}
        label="Entrée"
        required
        rows={3}
        hint="Un champ par ligne : nom · type · contrainte."
        value={values.input}
        onChange={(input) => set({ input })}
      />
      <AreaField
        {...common(context, "output")}
        label="Sortie"
        required
        rows={2}
        value={values.output}
        onChange={(output) => set({ output })}
      />
      <AreaField
        {...common(context, "errors")}
        label="Erreurs"
        rows={2}
        hint="Une par ligne : CODE · quand · règle."
        value={values.errors}
        onChange={(errors) => set({ errors })}
      />
      <TagsField
        {...common(context, "links")}
        label="Règles et fonctionnalités"
        value={values.links}
        projectId={projectId}
        kinds={["rule", "feature"]}
        validate={linkTag}
        placeholder="Ajouter…"
        onChange={(links) => set({ links })}
      />
      <TextField
        {...common(context, "rateLimit")}
        label="Limite de débit"
        value={values.rateLimit}
        maxLength={200}
        hint="ex. 10 par minute et par IP"
        onChange={(rateLimit) => set({ rateLimit })}
      />
    </>
  );
}

function OperationFields(context: Context) {
  return (
    <>
      <Identity {...context} />
      <Contract {...context} />
    </>
  );
}

const CONFIG: DomainFormConfig<OperationValues, "operation", OperationDetail> = {
  type: "operation",
  section: "Technique",
  icon: "api",
  noun: {
    create: "Nouvelle opération",
    edit: "Modifier l'opération",
    loading: "Chargement de l'opération…",
  },
  bodyLabel: "Saisie de l'opération",
  newFile: "api/endpoints/zone.verbe.yaml",
  conflict: "Une opération de ce nom existe déjà.",
  empty: EMPTY_OPERATION,
  valuesOf: operationValuesOf,
  issuesOf: operationIssues,
  operationOf: operationOperationOf,
  deleteKind: "op.delete",
  titleOf: (values) => values.name.trim(),
  labels: {
    name: "Nom",
    type: "Type",
    zone: "Zone",
    summary: "Résumé",
    permission: "Permission",
    input: "Entrée",
    output: "Sortie",
    errors: "Erreurs",
    links: "Règles et fonctionnalités",
    rateLimit: "Limite de débit",
  },
  fields: OperationFields,
  assist: {
    type: "operation",
    hint: "ex. « une opération pour s'inscrire sur la liste d'attente »",
    missing: "Décrivez d'abord l'opération en une phrase.",
    toValues: (output) =>
      output.type === "operation" ? operationPrefillValues(output.values) : output.values,
  },
};

/** Feuille « Opération » (maquette 14 l.427-479, 893-897) : sans composant, le serveur le déduit de la zone (B769). */
export function TechnicalOperationSheet(props: DomainFormProps) {
  return <DomainFormSheet props={props} config={CONFIG} />;
}

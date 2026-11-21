"use client";

import type { SpecItem } from "@koklo/contract";
import { useQuery } from "@tanstack/react-query";
import {
  COMPONENT_TYPES,
  type ComponentValues,
  componentIssues,
  componentOperationOf,
  componentValuesOf,
  dependencyTag,
  EMPTY_COMPONENT,
} from "../lib/component-operations.ts";
import { orpc } from "../lib/orpc.ts";
import { AreaField, ChoiceField, TagsField, TextField } from "./domain-form-fields.tsx";
import {
  type DomainFormConfig,
  type DomainFormProps,
  DomainFormSheet,
  type FieldsContext,
} from "./domain-form-sheet.tsx";

type Detail = Extract<SpecItem, { type: "component" }>["values"];

const OWNS_HINT = "Une table n'a qu'un seul propriétaire.";
const DEPENDS_HINT = "Composant · moyen (· asynchrone).";

const tableTag = (tag: string): string | null =>
  /^T-[a-z0-9][a-z0-9-]*$/.test(tag)
    ? null
    : `« ${tag} » n'est pas une table (exemple : T-client).`;
const featureTag = (tag: string): string | null =>
  /^F-\d{3,}$/.test(tag) ? null : `« ${tag} » n'est pas une fonctionnalité (exemple : F-001).`;

/** Zones déjà utilisées par les composants : proposées à la saisie, jamais imposées (une zone nouvelle reste permise). */
function useZones(projectId: string): string[] {
  const query = useQuery(
    orpc.spec.architecture.components.list.queryOptions({ input: { projectId, limit: 1 } }),
  );
  return Object.keys(query.data?.facets?.zone ?? {});
}

function Identity({ projectId, values, set, issues, readOnly }: FieldsContext<ComponentValues>) {
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
        hint="L'identifiant C-… se déduit du nom à l'enregistrement."
        onChange={(name) => set({ name })}
      />
      <ChoiceField
        {...common}
        field="type"
        label="Type"
        required
        value={values.type}
        options={COMPONENT_TYPES}
        onChange={(type) => set({ type })}
      />
      <TextField
        {...common}
        field="zone"
        label="Zone"
        required
        value={values.zone}
        maxLength={120}
        suggestions={zones}
        placeholder="ex. Prise de rendez-vous"
        onChange={(zone) => set({ zone })}
      />
      <AreaField
        {...common}
        field="responsibility"
        label="Responsabilité"
        required
        rows={3}
        value={values.responsibility}
        hint="Ce que fait le composant, et ce qu'il ne fait pas."
        onChange={(responsibility) => set({ responsibility })}
      />
    </>
  );
}

function Links({ projectId, values, set, issues, readOnly }: FieldsContext<ComponentValues>) {
  const common = { issues, readOnly };
  return (
    <>
      <TagsField
        {...common}
        field="owns"
        label="Possède les données"
        optional
        value={values.owns}
        hint={OWNS_HINT}
        projectId={projectId}
        kinds={["table"]}
        validate={tableTag}
        onChange={(owns) => set({ owns })}
      />
      <TagsField
        {...common}
        field="dependsOn"
        label="Dépend de"
        optional
        value={values.dependsOn}
        hint={DEPENDS_HINT}
        placeholder="C-db · SQL"
        validate={dependencyTag}
        onChange={(dependsOn) => set({ dependsOn })}
      />
      <TagsField
        {...common}
        field="serves"
        label="Sert les fonctionnalités"
        optional
        value={values.serves}
        projectId={projectId}
        kinds={["feature"]}
        validate={featureTag}
        onChange={(serves) => set({ serves })}
      />
    </>
  );
}

function ComponentFields(context: FieldsContext<ComponentValues>) {
  return (
    <>
      <Identity {...context} />
      <Links {...context} />
    </>
  );
}

const CONFIG: DomainFormConfig<ComponentValues, "component", Detail> = {
  type: "component",
  section: "Architecture",
  icon: "widgets",
  noun: {
    create: "Nouveau composant",
    edit: "Modifier le composant",
    loading: "Chargement du composant…",
  },
  bodyLabel: "Saisie du composant",
  newFile: "architecture/components/nom.yaml",
  conflict: "Un composant de ce nom existe déjà.",
  empty: EMPTY_COMPONENT,
  valuesOf: componentValuesOf,
  issuesOf: componentIssues,
  operationOf: componentOperationOf,
  titleOf: (values) => values.name.trim(),
  labels: {
    name: "Nom",
    type: "Type",
    zone: "Zone",
    responsibility: "Responsabilité",
    owns: "Possède les données",
    dependsOn: "Dépend de",
    serves: "Sert les fonctionnalités",
  },
  fields: ComponentFields,
};

/** Formulaire Composant (11 §3) : Nom*, Type*, Zone*, Responsabilité*, Possède, Dépend de, Sert. */
export function ArchitectureComponentSheet(props: DomainFormProps) {
  return <DomainFormSheet props={props} config={CONFIG} />;
}

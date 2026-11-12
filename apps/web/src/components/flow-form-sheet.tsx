"use client";

import type { FlowDetail } from "@koklo/contract";
import {
  EMPTY_FLOW,
  type FlowValues,
  flowIssues,
  flowOperationOf,
  flowValuesOf,
} from "../lib/domain-operations.ts";
import { AreaField, TagsField, TextField } from "./domain-form-fields.tsx";
import {
  type DomainFormConfig,
  type DomainFormProps,
  DomainFormSheet,
  type FieldsContext,
} from "./domain-form-sheet.tsx";

const featureTag = (tag: string): string | null =>
  /^F-\d{3,}$/.test(tag) ? null : `« ${tag} » n'est pas une fonctionnalité (exemple : F-001).`;

function FlowHead({ values, set, issues, readOnly }: FieldsContext<FlowValues>) {
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
      <TextField
        {...common}
        field="actor"
        label="Acteur"
        required
        value={values.actor}
        maxLength={120}
        hint="Qui fait ce parcours : Client, Accueil, Gérant…"
        onChange={(actor) => set({ actor })}
      />
      <TextField
        {...common}
        field="start"
        label="Point de départ"
        required
        value={values.start}
        hint="libellé · écran (S-…), l'écran est facultatif."
        onChange={(start) => set({ start })}
      />
    </>
  );
}

function FlowBody({ projectId, values, set, issues, readOnly }: FieldsContext<FlowValues>) {
  const common = { issues, readOnly };
  return (
    <>
      <AreaField
        {...common}
        field="steps"
        label="Étapes"
        required
        rows={4}
        value={values.steps}
        hint="Une étape par ligne : libellé · écran (S-…)."
        onChange={(steps) => set({ steps })}
      />
      <AreaField
        {...common}
        field="errors"
        label="Cas d'erreur"
        optional
        rows={2}
        value={values.errors}
        hint="Étape n : situation → ce qui se passe."
        onChange={(errors) => set({ errors })}
      />
      <TagsField
        {...common}
        field="features"
        label="Fonctionnalités"
        optional
        value={values.features}
        projectId={projectId}
        kinds={["feature"]}
        validate={featureTag}
        onChange={(features) => set({ features })}
      />
    </>
  );
}

function FlowFields(context: FieldsContext<FlowValues>) {
  return (
    <>
      <FlowHead {...context} />
      <FlowBody {...context} />
    </>
  );
}

const CONFIG: DomainFormConfig<FlowValues, "flow", FlowDetail> = {
  type: "flow",
  icon: "route",
  noun: {
    create: "Nouveau parcours",
    edit: "Modifier le parcours",
    loading: "Chargement du parcours…",
  },
  bodyLabel: "Saisie du parcours",
  newFile: "design/flows/P-titre.yaml",
  conflict: "Un parcours de ce titre existe déjà.",
  empty: EMPTY_FLOW,
  valuesOf: flowValuesOf,
  issuesOf: flowIssues,
  operationOf: flowOperationOf,
  titleOf: (values) => values.title.trim(),
  labels: {
    title: "Titre",
    actor: "Acteur",
    start: "Point de départ",
    steps: "Étapes",
    errors: "Cas d'erreur",
    features: "Fonctionnalités",
  },
  fields: FlowFields,
};

/** Formulaire Parcours (11 §3) : Titre*, Acteur*, Point de départ*, Étapes*, Cas d'erreur, Fonctionnalités. */
export function FlowFormSheet(props: DomainFormProps) {
  return <DomainFormSheet props={props} config={CONFIG} />;
}

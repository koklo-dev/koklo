"use client";

import type { SpecItem } from "@koklo/contract";
import {
  decisionTag,
  EMPTY_FLOW,
  type FlowValues,
  featureTag,
  flowIssues,
  flowOperationOf,
  flowTag,
  flowValuesOf,
  ruleTag,
} from "../lib/flow-operations.ts";
import { AreaField, TagsField, TextField } from "./domain-form-fields.tsx";
import {
  type DomainFormConfig,
  type DomainFormProps,
  DomainFormSheet,
  type FieldsContext,
} from "./domain-form-sheet.tsx";

type Detail = Extract<SpecItem, { type: "archflow" }>["values"];

const STEPS_HINT =
  "Une étape par ligne : C-portail -> C-api : texte | retour: ok | erreur: refus. « alt: libellé » … « fin » ouvre un bloc ; « --- libellé » un séparateur.";

function Identity({
  values,
  set,
  issues,
  readOnly,
  mode,
}: FieldsContext<FlowValues> & { mode: "create" | "edit" }) {
  const common = { issues, readOnly };
  return (
    <>
      <TextField
        issues={issues}
        field="flow"
        label="Parcours"
        required
        value={values.flow}
        maxLength={80}
        placeholder="P-reserver"
        hint="Le flux détaille un parcours du fonctionnel : il porte son identifiant."
        readOnly={readOnly || mode === "edit"}
        onChange={(flow) => set({ flow })}
      />
      <TagsField
        {...common}
        field="participants"
        label="Participants"
        required
        value={values.participants}
        hint="De gauche à droite dans le diagramme : composants (C-api) et rôles (RL-client)."
        placeholder="C-api"
        validate={flowTag}
        onChange={(participants) => set({ participants })}
      />
      <AreaField
        {...common}
        field="steps"
        label="Étapes"
        required
        rows={10}
        value={values.steps}
        hint={STEPS_HINT}
        placeholder="RL-client -> C-portail : Choisit un créneau"
        onChange={(steps) => set({ steps })}
      />
    </>
  );
}

function Links({ projectId, values, set, issues, readOnly }: FieldsContext<FlowValues>) {
  const common = { issues, readOnly };
  return (
    <>
      <TagsField
        {...common}
        field="features"
        label="Sert les fonctionnalités"
        optional
        value={values.features}
        projectId={projectId}
        kinds={["feature"]}
        validate={featureTag}
        onChange={(features) => set({ features })}
      />
      <TagsField
        {...common}
        field="rules"
        label="Applique les règles"
        optional
        value={values.rules}
        projectId={projectId}
        kinds={["rule"]}
        validate={ruleTag}
        onChange={(rules) => set({ rules })}
      />
      <TagsField
        {...common}
        field="decisions"
        label="Décisions"
        optional
        value={values.decisions}
        placeholder="ADR-001"
        validate={decisionTag}
        onChange={(decisions) => set({ decisions })}
      />
    </>
  );
}

const configOf = (mode: "create" | "edit"): DomainFormConfig<FlowValues, "archflow", Detail> => ({
  type: "archflow",
  section: "Architecture",
  icon: "swap_horiz",
  noun: {
    create: "Nouveau flux",
    edit: "Modifier le flux",
    loading: "Chargement du flux…",
  },
  bodyLabel: "Saisie du flux",
  newFile: "architecture/flows/parcours.yaml",
  conflict: "Un flux existe déjà pour ce parcours.",
  empty: EMPTY_FLOW,
  valuesOf: flowValuesOf,
  issuesOf: (values) => flowIssues(values, mode),
  operationOf: flowOperationOf,
  titleOf: (values) => values.flow.trim(),
  labels: {
    flow: "Parcours",
    participants: "Participants",
    steps: "Étapes",
    features: "Sert les fonctionnalités",
    rules: "Applique les règles",
    decisions: "Décisions",
  },
  fields: (context) => (
    <>
      <Identity {...context} mode={mode} />
      <Links {...context} />
    </>
  ),
});
const CREATE = configOf("create");
const EDIT = configOf("edit");

/** Formulaire Flux (B545) : Parcours*, Participants*, Étapes*, liens ; aucun préremplissage par l'agent. */
export function ArchitectureFlowSheet(props: DomainFormProps) {
  return <DomainFormSheet props={props} config={props.mode === "edit" ? EDIT : CREATE} />;
}

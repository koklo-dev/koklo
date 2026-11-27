"use client";

import type { ThreatDetail } from "@koklo/contract";
import { THREAT_FORM_OPTIONS } from "../lib/security-form-options.ts";
import {
  EMPTY_THREAT,
  SURFACE_TAG,
  type ThreatValues,
  threatIssues,
  threatOperationOf,
  threatPrefillValues,
  threatValuesOf,
} from "../lib/security-operations.ts";
import { AreaField, ChoiceField, TagsField, TextField } from "./domain-form-fields.tsx";
import {
  type DomainFormConfig,
  type DomainFormProps,
  DomainFormSheet,
  type FieldsContext,
} from "./domain-form-sheet.tsx";

type Context = FieldsContext<ThreatValues>;

const surfaceTag = (tag: string): string | null =>
  SURFACE_TAG.test(tag) ? null : `« ${tag} » n'est ni une fonctionnalité (ex. F-004) ni « API ».`;

const common = ({ issues, readOnly, filled }: Context, field: string) => ({
  field,
  issues,
  readOnly,
  agentFilled: filled.has(field),
});

function Identity(context: Context) {
  const { projectId, values, set } = context;
  return (
    <>
      <TextField
        {...common(context, "title")}
        label="Titre"
        required
        value={values.title}
        maxLength={200}
        onChange={(title) => set({ title })}
      />
      <ChoiceField
        {...common(context, "category")}
        label="Catégorie"
        required
        value={values.category}
        options={THREAT_FORM_OPTIONS.category}
        onChange={(category) => set({ category })}
      />
      <ChoiceField
        {...common(context, "severity")}
        label="Gravité"
        required
        value={values.severity}
        options={THREAT_FORM_OPTIONS.severity}
        hint="Élevée : données de clientes ou argent en jeu. Une menace élevée sans parade bloque la validation."
        onChange={(severity) => set({ severity })}
      />
      <TagsField
        {...common(context, "surfaces")}
        label="Fonctionnalités exposées"
        required
        value={values.surfaces}
        projectId={projectId}
        kinds={["feature"]}
        validate={surfaceTag}
        placeholder="Ajouter…"
        onChange={(surfaces) => set({ surfaces })}
      />
    </>
  );
}

function Protection(context: Context) {
  const { values, set } = context;
  return (
    <>
      <AreaField
        {...common(context, "risk")}
        label="Ce qui peut arriver"
        required
        rows={3}
        value={values.risk}
        hint="Qui, comment, avec quelle conséquence."
        onChange={(risk) => set({ risk })}
      />
      <AreaField
        {...common(context, "measures")}
        label="Parades"
        required
        rows={3}
        value={values.measures}
        hint="Une parade par ligne : ce que le produit fait pour l'empêcher ou le limiter."
        onChange={(measures) => set({ measures })}
      />
      <ChoiceField
        {...common(context, "verification")}
        label="Vérification"
        required
        value={values.verification}
        options={THREAT_FORM_OPTIONS.verification}
        onChange={(verification) => set({ verification })}
      />
    </>
  );
}

function ThreatFields(context: Context) {
  return (
    <>
      <Identity {...context} />
      <Protection {...context} />
    </>
  );
}

const CONFIG: DomainFormConfig<ThreatValues, "threat", ThreatDetail> = {
  type: "threat",
  section: "Sécurité",
  icon: "gpp_maybe",
  noun: {
    create: "Nouvelle menace",
    edit: "Modifier la menace",
    loading: "Chargement de la menace…",
  },
  bodyLabel: "Saisie de la menace",
  newFile: "security/threats/SEC-Txx.yaml",
  conflict: "Une menace porte déjà cet identifiant.",
  empty: EMPTY_THREAT,
  valuesOf: threatValuesOf,
  issuesOf: threatIssues,
  operationOf: threatOperationOf,
  titleOf: (values) => values.title.trim(),
  labels: {
    title: "Titre",
    category: "Catégorie",
    severity: "Gravité",
    surfaces: "Fonctionnalités exposées",
    risk: "Ce qui peut arriver",
    measures: "Parades",
    verification: "Vérification",
  },
  fields: ThreatFields,
  assist: {
    type: "threat",
    hint: "ex. « quelqu'un réserve tous les créneaux du samedi pour bloquer le salon »",
    missing: "Décrivez d'abord la menace en une phrase.",
    toValues: threatPrefillValues,
  },
};

/** Feuille « Menace » (maquette 15 l.343-395, 706-710). */
export function SecurityThreatSheet(props: DomainFormProps) {
  return <DomainFormSheet props={props} config={CONFIG} />;
}

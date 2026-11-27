"use client";

import type { NfrDetail } from "@koklo/contract";
import {
  EMPTY_NFR,
  NFR_LINK,
  type NfrValues,
  nfrIssues,
  nfrOperationOf,
  nfrValuesOf,
} from "../lib/technical-api-forms.ts";
import { NFR_CATEGORIES, VERIFICATION_LABELS } from "../lib/technical-api-labels.ts";
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

type Context = FieldsContext<NfrValues>;

const VERIFICATIONS = (["scenario", "ci_measure", "manual", "to_define"] as const).map((value) => ({
  value,
  label: VERIFICATION_LABELS[value],
}));

const linkTag = (tag: string): string | null =>
  NFR_LINK.test(tag) ? null : `« ${tag} » n'est pas un lien d'exigence (ex. C-api).`;

const common = ({ issues, readOnly, filled }: Context, field: string) => ({
  field,
  issues,
  readOnly,
  agentFilled: filled.has(field),
});

function Target(context: Context) {
  const { values, set } = context;
  return (
    <>
      <ChoiceField
        {...common(context, "category")}
        label="Catégorie"
        required
        value={values.category}
        options={NFR_CATEGORIES}
        onChange={(category) => set({ category })}
      />
      <TextField
        {...common(context, "title")}
        label="Titre"
        required
        value={values.title}
        maxLength={200}
        onChange={(title) => set({ title })}
      />
      <TextField
        {...common(context, "target")}
        label="Cible mesurable"
        required
        value={values.target}
        maxLength={120}
        hint="Une valeur vérifiable : « p95 < 300 ms », « 99,5 % par mois »."
        onChange={(target) => set({ target })}
      />
    </>
  );
}

function Proof(context: Context) {
  const { projectId, values, set } = context;
  return (
    <>
      <AreaField
        {...common(context, "statement")}
        label="Énoncé"
        required
        rows={3}
        value={values.statement}
        onChange={(statement) => set({ statement })}
      />
      <SelectField
        {...common(context, "verification")}
        label="Vérification"
        required
        value={values.verification}
        options={VERIFICATIONS}
        hint="Comment le lot Qualité la prouve."
        onChange={(verification) => set({ verification })}
      />
      <TagsField
        {...common(context, "links")}
        label="Liens"
        value={values.links}
        projectId={projectId}
        kinds={["component", "stack", "adr", "rule"]}
        validate={linkTag}
        hint="Composants, choix techniques, décisions."
        placeholder="Ajouter…"
        onChange={(links) => set({ links })}
      />
    </>
  );
}

function NfrFields(context: Context) {
  return (
    <>
      <Target {...context} />
      <Proof {...context} />
    </>
  );
}

const CONFIG: DomainFormConfig<NfrValues, "nfr", NfrDetail> = {
  type: "nfr",
  section: "Technique",
  icon: "speed",
  noun: {
    create: "Nouvelle exigence",
    edit: "Modifier l'exigence",
    loading: "Chargement de l'exigence…",
  },
  bodyLabel: "Saisie de l'exigence",
  newFile: "nfr/NFR-nnn.yaml",
  conflict: "Une exigence de cet identifiant existe déjà.",
  empty: EMPTY_NFR,
  valuesOf: nfrValuesOf,
  issuesOf: nfrIssues,
  operationOf: nfrOperationOf,
  titleOf: (values) => values.title.trim(),
  labels: {
    category: "Catégorie",
    title: "Titre",
    target: "Cible mesurable",
    statement: "Énoncé",
    verification: "Vérification",
    links: "Liens",
  },
  fields: NfrFields,
  assist: {
    type: "nfr",
    hint: "ex. « les SMS de rappel partent à l'heure même si le fournisseur est lent »",
    missing: "Décrivez d'abord l'exigence en une phrase.",
  },
};

/** Feuille « Exigence » (maquette 14 l.427-479, 898-902) : cible mesurable et vérification. */
export function TechnicalNfrSheet(props: DomainFormProps) {
  return <DomainFormSheet props={props} config={CONFIG} />;
}

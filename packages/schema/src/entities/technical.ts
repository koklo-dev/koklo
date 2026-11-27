import { z } from "zod";
import type { ComponentType } from "./architecture.ts";
import { FEATURE_ZONE_MAX_LENGTH } from "./feature.ts";
import {
  adrId,
  componentId,
  environmentId,
  featureId,
  nfrId,
  operationId,
  PATTERNS,
  permissionId,
  ruleId,
  stackId,
} from "./ids.ts";

/**
 * Formats du cahier technique (TK-115, passation 12 §1, B719 à B723) : `tech/stack/<slug>.yaml`,
 * `api/endpoints/<zone.verbe>.yaml`, `nfr/NFR-nnn.yaml` et `tech/environments.yaml`. Objets fermés, clés françaises.
 */
const line = z.string().min(1);

export const STACK_LAYERS = [
  "applications",
  "services",
  "donnees",
  "externes",
  "exploitation",
] as const;
export const STACK_ICONS = [
  "web",
  "hub",
  "key",
  "database",
  "queue",
  "sms",
  "mail",
  "cloud",
  "monitoring",
  "rocket_launch",
  "search",
  "payments",
] as const;
export const STACK_STATUSES = ["choisi", "a_trancher"] as const;
export const OPERATION_TYPES = ["lecture", "ecriture", "interne"] as const;
export const NFR_CATEGORIES = [
  "donnees",
  "performance",
  "securite",
  "disponibilite",
  "accessibilite",
  "exploitation",
] as const;
export const NFR_VERIFICATION_MODES = ["scenario", "mesure_ci", "manuel", "a_definir"] as const;
export const ENVIRONMENT_DATA = ["jeux_exemple", "copie_anonymisee", "reelles"] as const;
export const ENVIRONMENT_DEPLOYMENTS = ["fusion", "validation", "manuel"] as const;
export const INTEGRATION_STATUSES = [
  "a_trancher",
  "compte_a_creer",
  "configure",
  "connecte",
] as const;
/** Nom d'une variable d'environnement : la spec n'en porte que le nom et l'usage, jamais la valeur. */
export const VARIABLE_NAME = /^[A-Z][A-Z0-9_]*$/;
/** Champ d'entrée ou de sortie d'une opération (`serviceId`, `lignes[].id`). */
export const OPERATION_FIELD_NAME = /^[A-Za-z][A-Za-z0-9_.[\]]*$/;

export type StackLayer = (typeof STACK_LAYERS)[number];

const LAYER_OF_COMPONENT: Readonly<Record<ComponentType, StackLayer>> = {
  app: "applications",
  service: "services",
  store: "donnees",
  queue: "donnees",
  ext: "externes",
};

/** Couche d'un choix créé sans elle : celle de son premier composant, « exploitation » sans composant (B719). */
export const stackLayerOf = (type: ComponentType | undefined): StackLayer =>
  type === undefined ? "exploitation" : LAYER_OF_COMPONENT[type];

const criterion = z.strictObject({
  nom: line,
  /** Valeurs chiffrées estimées par l'agent (B734). */
  estimation: z.boolean().optional(),
  /** Une valeur par option, dans le même ordre ; « — » si inconnue. */
  valeurs: z.array(line),
});

/** Ce qui doit concorder dans un choix, quel que soit le nom des champs (fichier ou proposition). */
export interface StackCoherence {
  readonly chosen: boolean;
  readonly choice: string | undefined;
  readonly recommended: string | undefined;
  readonly options: readonly string[];
  readonly criteriaValues: readonly (readonly string[])[];
}

type StackKeys = Readonly<Record<"choice" | "recommended" | "criteria" | "values", string>>;
export type StackProblem = { message: string; path: (string | number)[] };

/**
 * Incohérences d'un choix : choix selon le statut, options distinctes, recommandation parmi elles, une valeur de critère
 * par option. `keys` nomme les champs du pointeur dans la forme validée.
 */
export function stackProblems(stack: StackCoherence, keys: StackKeys): StackProblem[] {
  const problems: StackProblem[] = [];
  const report = (message: string, ...path: (string | number)[]) =>
    problems.push({ message, path });
  if (stack.chosen !== (stack.choice !== undefined)) {
    report("un choix retenu le nomme, un choix à trancher n'en porte aucun", keys.choice);
  }
  if (new Set(stack.options).size !== stack.options.length) {
    report("les options sont distinctes", "options");
  }
  if (stack.recommended !== undefined && !stack.options.includes(stack.recommended)) {
    report("l'option recommandée est l'une des options", keys.recommended);
  }
  stack.criteriaValues.forEach((values, i) => {
    if (values.length === stack.options.length) return;
    report("une valeur par option", keys.criteria, i, keys.values);
  });
  return problems;
}

const FILE_KEYS: StackKeys = {
  choice: "choix",
  recommended: "recommande",
  criteria: "criteres",
  values: "valeurs",
};

/** Choix technique `tech/stack/<slug>.yaml` : un choix par rôle de l'architecture. */
export const StackSchema = z
  .strictObject({
    id: stackId,
    couche: z.enum(STACK_LAYERS),
    icone: z.enum(STACK_ICONS).optional(),
    role: line,
    statut: z.enum(STACK_STATUSES),
    choix: line.optional(),
    recommande: line.optional(),
    composants: z.array(componentId).default([]),
    options: z.array(line).min(2),
    criteres: z.array(criterion).default([]),
    pourquoi: line,
    en_clair: line.optional(),
    exigences: z.array(nfrId).default([]),
    decisions: z.array(adrId).default([]),
  })
  .superRefine((stack, ctx) => {
    const coherence = {
      chosen: stack.statut === "choisi",
      choice: stack.choix,
      recommended: stack.recommande,
      options: stack.options,
      criteriaValues: stack.criteres.map((entry) => entry.valeurs),
    };
    for (const problem of stackProblems(coherence, FILE_KEYS)) {
      ctx.addIssue({ code: "custom", ...problem });
    }
  });

const fieldName = z.string().regex(OPERATION_FIELD_NAME);

/** Opération `api/endpoints/<zone.verbe>.yaml` : indépendante de tout langage ; le contrat en est généré. */
export const OperationSchema = z.strictObject({
  id: operationId,
  type: z.enum(OPERATION_TYPES),
  zone: z.string().min(1).max(FEATURE_ZONE_MAX_LENGTH),
  composant: componentId,
  permission: z.union([z.enum(["public", "interne"]), permissionId]),
  resume: line,
  entree: z
    .record(fieldName, z.strictObject({ type: line, contrainte: line.optional() }))
    .default({}),
  sortie: z.record(fieldName, z.strictObject({ type: line, note: line.optional() })).default({}),
  erreurs: z
    .array(z.strictObject({ code: line, quand: line, regle: ruleId.optional() }))
    .default([]),
  regles: z.array(ruleId).default([]),
  sert: z.array(featureId).default([]),
  limite: line.optional(),
});

const nfrLink = z
  .string()
  .regex(
    new RegExp(
      [PATTERNS.component, PATTERNS.stack, PATTERNS.adr, PATTERNS.rule]
        .map((pattern) => pattern.source)
        .join("|"),
    ),
  );

/** Exigence non fonctionnelle `nfr/NFR-nnn.yaml` : une cible mesurable et sa vérification. */
export const NfrSchema = z.strictObject({
  id: nfrId,
  categorie: z.enum(NFR_CATEGORIES),
  titre: line,
  cible: line,
  enonce: line,
  verification: z.strictObject({ mode: z.enum(NFR_VERIFICATION_MODES), detail: line.optional() }),
  liens: z.array(nfrLink).default([]),
});

export const EnvironmentSchema = z.strictObject({
  id: environmentId,
  nom: line,
  adresse: line,
  hebergement: line,
  base: line,
  donnees: z.enum(ENVIRONMENT_DATA),
  deploiement: z.enum(ENVIRONMENT_DEPLOYMENTS).optional(),
  acces: line.optional(),
  /** Lignes libres du tableau (ex. « SMS »). */
  lignes: z.array(z.strictObject({ libelle: line, valeur: line })).optional(),
});

const unique = <T>(items: readonly T[], keyOf: (item: T) => string): boolean =>
  new Set(items.map(keyOf)).size === items.length;

/** `tech/environments.yaml` : environnements, variables (noms seulement) et intégrations externes. */
export const EnvironmentsFileSchema = z.strictObject({
  environnements: z
    .array(EnvironmentSchema)
    .default([])
    .refine((list) => unique(list, (entry) => entry.id), "les identifiants sont uniques"),
  variables: z
    .array(z.strictObject({ nom: z.string().regex(VARIABLE_NAME), usage: line }))
    .default([])
    .refine((list) => unique(list, (entry) => entry.nom), "les noms de variable sont uniques"),
  integrations: z
    .array(z.strictObject({ service: line, usage: line, statut: z.enum(INTEGRATION_STATUSES) }))
    .default([]),
});

export type Stack = z.output<typeof StackSchema>;
/** Entité avant les valeurs par défaut : ce que l'émission accepte. */
export type StackInput = z.input<typeof StackSchema>;
export type Operation = z.output<typeof OperationSchema>;
export type OperationInput = z.input<typeof OperationSchema>;
export type Nfr = z.output<typeof NfrSchema>;
export type NfrInput = z.input<typeof NfrSchema>;
export type Environment = z.output<typeof EnvironmentSchema>;
export type EnvironmentsFile = z.output<typeof EnvironmentsFileSchema>;
export type EnvironmentsFileInput = z.input<typeof EnvironmentsFileSchema>;

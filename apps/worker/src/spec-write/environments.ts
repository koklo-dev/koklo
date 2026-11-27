import {
  type Environment,
  type EnvironmentsFile,
  emitEnvironmentsYaml,
  TECHNICAL_PROPOSAL_VOCABULARY,
} from "@koklo/schema";
import { overlaid, readEntity, wordOf, writeEntity } from "./technical-files.ts";
import type { BatchOperation } from "./types.ts";
import { forbidDesigner, type Workspace } from "./workspace.ts";

type Words = typeof TECHNICAL_PROPOSAL_VOCABULARY;

export const ENVIRONMENTS_PATH = "tech/environments.yaml";

/** Champs d'une opération `env.create|update` (contrat 3.17.0), tous facultatifs ici. */
interface EnvironmentPayload {
  name?: string;
  address?: string;
  hosting?: string;
  database?: string;
  data?: keyof Words["environmentData"];
  deployment?: keyof Words["deployment"];
  access?: string;
  extras?: { label: string; value: string }[];
  variables?: { name: string; usage: string }[];
  integrations?: { service: string; usage: string; status: keyof Words["integrationStatus"] }[];
}

const NO_FILE: EnvironmentsFile = { environnements: [], variables: [], integrations: [] };

/** Le fichier des environnements de la tête (vide s'il n'existe pas). */
const readEnvironments = (workspace: Workspace): EnvironmentsFile =>
  workspace.files.has(ENVIRONMENTS_PATH)
    ? readEntity(workspace, ENVIRONMENTS_PATH, (spec) => spec.environments)
    : NO_FILE;

function overlay(base: Environment, payload: EnvironmentPayload): Environment {
  const words = TECHNICAL_PROPOSAL_VOCABULARY;
  const next = overlaid(base, {
    nom: payload.name,
    adresse: payload.address,
    hebergement: payload.hosting,
    base: payload.database,
    donnees: wordOf(words.environmentData, payload.data),
    deploiement: wordOf(words.deployment, payload.deployment),
    acces: payload.access,
    lignes: payload.extras?.map(({ label, value }) => ({ libelle: label, valeur: value })),
  });
  // « Accès » vidé dans la feuille : la rubrique quitte le fichier (B765).
  if (payload.access !== "") return next;
  const { acces: _cleared, ...rest } = next;
  return rest;
}

/** Ajoute ou remplace chaque entrée par sa clé, l'ordre du fichier gardé. */
function upsert<T>(list: readonly T[], added: readonly T[], keyOf: (item: T) => string): T[] {
  const byKey = new Map(list.map((item) => [keyOf(item), item]));
  for (const item of added) byKey.set(keyOf(item), item);
  return [...byKey.values()];
}

/** Variables et intégrations de l'opération : elles valent pour tout le fichier (B722). */
function shared(file: EnvironmentsFile, payload: EnvironmentPayload) {
  const variables = (payload.variables ?? []).map(({ name, usage }) => ({ nom: name, usage }));
  const integrations = (payload.integrations ?? []).map(({ service, usage, status }) => ({
    service,
    usage,
    statut: TECHNICAL_PROPOSAL_VOCABULARY.integrationStatus[status],
  }));
  return {
    variables: upsert(file.variables, variables, (entry) => entry.nom),
    integrations: upsert(file.integrations, integrations, (entry) => entry.service),
  };
}

const emptyEnvironment = (id: string): Environment => ({
  id,
  nom: "",
  adresse: "",
  hebergement: "",
  base: "",
  donnees: "jeux_exemple",
});

function environmentsAfter(list: readonly Environment[], operation: BatchOperation): Environment[] {
  const id = operation.targetSpecId ?? "";
  const payload = operation.payload as EnvironmentPayload;
  if (operation.kind === "env.delete") return list.filter((entry) => entry.id !== id);
  if (operation.kind === "env.create") return [...list, overlay(emptyEnvironment(id), payload)];
  return list.map((entry) => (entry.id === id ? overlay(entry, payload) : entry));
}

/**
 * `env.create|update|delete` sur `tech/environments.yaml` : le fichier est relu sur la tête à chaque tentative, seul
 * l'environnement visé change ; aucune valeur de variable n'a de place dans le format.
 */
export function applyEnvironment(workspace: Workspace, operation: BatchOperation): void {
  forbidDesigner(workspace);
  const id = operation.targetSpecId ?? "";
  const file = readEnvironments(workspace);
  const next: EnvironmentsFile = {
    environnements: environmentsAfter(file.environnements, operation),
    ...shared(file, operation.payload as EnvironmentPayload),
  };
  writeEntity(workspace, ENVIRONMENTS_PATH, id, () => emitEnvironmentsYaml(next));
}

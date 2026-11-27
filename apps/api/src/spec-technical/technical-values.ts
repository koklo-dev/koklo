import type { StackSummary, TechnicalEnvironment, TechnicalEnvironments } from "@koklo/contract";
import { STACK_ICONS } from "@koklo/contract";
import { emitStackYaml, type Stack, TECHNICAL_PROPOSAL_VOCABULARY } from "@koklo/schema";
import { isRecord, list, text, texts } from "../spec-read/entity-values.ts";

/**
 * Lecture tolérante des entités du cahier technique (`spec_entities.data`, TK-115), écrites par le worker depuis
 * `tech/stack/`, `tech/environments.yaml` et `nfr/` : les valeurs françaises des fichiers deviennent le vocabulaire anglais
 * du contrat. Rien n'est supposé : un champ absent ou d'un autre type reprend sa valeur neutre. Aucune valeur de variable
 * n'est lue.
 */
type Json = Record<string, unknown>;
const COMPONENT = /^C-[a-z0-9][a-z0-9-]*$/;
const REQUIREMENT = /^NFR-[a-z0-9][a-z0-9-]*$/;
const DECISION = /^ADR-\d{3,}$/;
const ENVIRONMENT = /^ENV-[a-z0-9][a-z0-9-]*$/;

export const record = (value: unknown): Json => (isRecord(value) ? value : {});
const matching = (value: unknown, pattern: RegExp): string[] =>
  texts(value).filter((id) => pattern.test(id));
/** Valeur du contrat dont la traduction de fichier est `value`. */
export function englishOf<K extends string>(
  words: Readonly<Record<K, string>>,
  value: unknown,
  fallback: K,
): K {
  const found = (Object.keys(words) as K[]).find((key) => words[key] === value);
  return found ?? fallback;
}
/** `{ [key]: texte }` quand le texte existe, rien sinon (champs facultatifs du contrat). */
export const optional = <K extends string>(key: K, value: unknown): { [P in K]?: string } =>
  (text(value) === "" ? {} : { [key]: text(value) }) as { [P in K]?: string };

const criteriaOf = (value: unknown): StackSummary["criteria"] =>
  list(value).map((entry) => {
    const criterion = record(entry);
    return {
      label: text(criterion.nom),
      ...(criterion.estimation === true ? { estimate: true } : {}),
      values: list(criterion.valeurs).map(text),
    };
  });

/** Comptes par valeur, dans l'ordre `compare` des valeurs (par défaut celui des codes) ; les valeurs vides sont ignorées. */
export function countValues(
  values: readonly string[],
  compare: (a: string, b: string) => number = (a, b) => (a < b ? -1 : a > b ? 1 : 0),
): Record<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) {
    if (value !== "") counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return Object.fromEntries([...counts].sort(([a], [b]) => compare(a, b)));
}

/** Un élément vu du client : sans chemin de fichier ; `id` à la place de `specId`. */
export function withClientId<T extends { specId: string; filePath: string }>({
  specId,
  filePath: _path,
  ...rest
}: T) {
  return { id: specId, ...rest };
}

/** Un choix de la stack tel que la grille et la fiche l'affichent. */
export function stackSummary(specId: string, path: string, data: unknown): StackSummary {
  const json = record(data);
  const icon = STACK_ICONS.find((known) => known === json.icone);
  return {
    specId,
    role: text(json.role) || specId,
    layer: englishOf(TECHNICAL_PROPOSAL_VOCABULARY.layer, json.couche, "operations"),
    ...(icon === undefined ? {} : { icon }),
    status: englishOf(TECHNICAL_PROPOSAL_VOCABULARY.stackStatus, json.statut, "open"),
    ...optional("choice", json.choix),
    ...optional("recommended", json.recommande),
    components: matching(json.composants, COMPONENT),
    options: texts(json.options),
    criteria: criteriaOf(json.criteres),
    why: text(json.pourquoi),
    ...optional("plain", json.en_clair),
    requirements: matching(json.exigences, REQUIREMENT),
    decisions: matching(json.decisions, DECISION),
    filePath: path,
  };
}

function environmentOf(entry: unknown): TechnicalEnvironment[] {
  const json = record(entry);
  const specId = text(json.id);
  if (!ENVIRONMENT.test(specId)) return [];
  const words = TECHNICAL_PROPOSAL_VOCABULARY;
  const deployment =
    json.deploiement === undefined
      ? undefined
      : englishOf(words.deployment, json.deploiement, "manual");
  return [
    {
      specId,
      name: text(json.nom) || specId,
      address: text(json.adresse),
      hosting: text(json.hebergement),
      database: text(json.base),
      data: englishOf(words.environmentData, json.donnees, "sample"),
      ...(deployment === undefined ? {} : { deployment }),
      ...optional("access", json.acces),
      extras: list(json.lignes).map((row) => ({
        label: text(record(row).libelle),
        value: text(record(row).valeur),
      })),
    },
  ];
}

/** Contenu de `tech/environments.yaml` au vocabulaire du contrat. */
export function environmentsContent(data: unknown): Omit<TechnicalEnvironments, "commitSha"> {
  const json = record(data);
  return {
    environments: list(json.environnements).flatMap(environmentOf),
    variables: list(json.variables).map((entry) => ({
      name: text(record(entry).nom),
      usage: text(record(entry).usage),
    })),
    integrations: list(json.integrations).map((entry) => ({
      service: text(record(entry).service),
      usage: text(record(entry).usage),
      status: englishOf(
        TECHNICAL_PROPOSAL_VOCABULARY.integrationStatus,
        record(entry).statut,
        "to_choose",
      ),
    })),
  };
}

/** YAML d'un choix régénéré depuis l'index (sans la clé « titre » de l'index) ; données illisibles : texte vide. */
export function stackSource(data: unknown): string {
  const { titre: _title, ...entity } = record(data);
  try {
    return emitStackYaml(entity as unknown as Stack);
  } catch {
    return "";
  }
}

export interface TechnicalFacts {
  stack: number;
  /** Entités `endpoint` : opérations et endpoints REST. */
  endpoint: number;
  /** Lignes de `spec_endpoints` (REST seul). */
  restEndpoints: number;
  nfr: number;
  /** Données de l'entité `environments`, `null` sans fichier. */
  environments: unknown;
}

/** Compteurs du cahier technique : `endpoints` est le plus grand des deux index (B720). */
export const technicalCounts = (facts: TechnicalFacts) => ({
  stack: facts.stack,
  endpoints: Math.max(facts.restEndpoints, facts.endpoint),
  nfr: facts.nfr,
  environments: list(record(facts.environments).environnements).length,
});

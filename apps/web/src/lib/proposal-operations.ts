import {
  SPEC_BATCH_MAX_BODY_BYTES,
  SPEC_BATCH_OPERATIONS_MAX,
  type SpecBatchSubmitInput,
  FEATURE_ZONE_MAX_LENGTH as ZONE_MAX,
} from "@koklo/contract";
import { isDataKind } from "./proposal-data.ts";
import type { ProposalOutput } from "./proposal-types.ts";

type Operation = SpecBatchSubmitInput["operations"][number];
type Step = { type: "etant_donne" | "quand" | "alors" | "et"; text: string };
type CriterionContent = { title: string; steps: Step[] };

/** Un lot à soumettre : au plus 200 opérations, clé d'idempotence stable, preuve serveur par `proposalIds`. */
export interface BatchPlan {
  key: string;
  operations: Operation[];
  proposalIds: string[];
}

const str = (value: unknown): string => (typeof value === "string" ? value : "");

function criteriaOf(content: Record<string, unknown>): CriterionContent[] {
  const raw = Array.isArray(content.criteria) ? content.criteria : [];
  return raw.map((item: Record<string, unknown>) => ({
    title: str(item.title),
    steps: (Array.isArray(item.steps) ? item.steps : []).map((step: Record<string, unknown>) => ({
      type: str(step.type) as Step["type"],
      text: str(step.text),
    })),
  }));
}

const strings = (value: unknown): string[] =>
  (Array.isArray(value) ? value : []).filter((item): item is string => typeof item === "string");

/** Champ facultatif : absent quand la proposition ne le porte pas (le contrat refuse une liste vide pour certains). */
const optional = <T>(key: string, value: T | undefined | []): Record<string, T> =>
  value === undefined || (Array.isArray(value) && value.length === 0) ? {} : { [key]: value as T };

/** `rule.create` : le type est « contrainte » quand l'agent n'en dit rien. */
function ruleOperation(content: Record<string, unknown>): Operation {
  const type = ["contrainte", "calcul", "workflow"].includes(str(content.type))
    ? (str(content.type) as "contrainte" | "calcul" | "workflow")
    : "contrainte";
  const example = str(content.example).trim();
  return {
    kind: "rule.create",
    title: str(content.title).trim(),
    type,
    statement: str(content.statement).trim(),
    ...optional("examples", example ? [example] : undefined),
    ...optional("states", type === "workflow" ? strings(content.states) : undefined),
    ...optional("features", strings(content.features)),
  };
}

function roleOperation(content: Record<string, unknown>): Operation {
  const permissions = (Array.isArray(content.permissions) ? content.permissions : []).map(
    (item: Record<string, unknown>) => {
      const restriction = str(item.restriction).trim();
      return { id: str(item.id), ...(restriction ? { restriction } : {}) };
    },
  );
  return {
    kind: "role.create",
    name: str(content.name).trim(),
    description: str(content.description).trim(),
    permissions,
  };
}

/** `flow.create` : acteur « Client » et départ = première étape quand l'agent ne les donne pas (11 §3). */
function flowOperation(content: Record<string, unknown>): Operation {
  const labels = strings(content.steps);
  const given = str(content.start).trim();
  const start = given || labels[0] || "";
  const rest = given || labels.length < 2 ? labels : labels.slice(1);
  const steps = rest.map((label) => ({ label }));
  const errors = (Array.isArray(content.errors) ? content.errors : []).map(
    (item: Record<string, unknown>) => ({ step: Number(item.step), text: str(item.text) }),
  );
  return {
    kind: "flow.create",
    title: str(content.title).trim(),
    actor: str(content.actor).trim() || "Client",
    start: { label: start },
    steps,
    ...optional("errors", errors),
    ...optional("features", strings(content.features)),
  };
}

const records = (value: unknown): Array<Record<string, unknown>> =>
  (Array.isArray(value) ? value : []).filter(
    (item): item is Record<string, unknown> => typeof item === "object" && item !== null,
  );

type Cardinality = "1 → 1" | "1 → 0..1" | "1 → n" | "n → 1" | "n ↔ n";
const relationsOf = (value: unknown) =>
  records(value).map((r) => ({ to: str(r.to), cardinality: str(r.cardinality) as Cardinality }));

/** `table.create` : zone de la proposition, relations déjà rattachées par `prepareDataProposals`. */
function tableOperation(proposal: ProposalOutput): Operation {
  const { content } = proposal;
  const description = str(content.description).trim();
  const relations = relationsOf(content.relationsOut);
  return {
    kind: "table.create",
    name: str(content.name).trim(),
    zone: proposal.zone.trim().slice(0, ZONE_MAX),
    ...optional("description", description || undefined),
    ...optional("sources", strings(content.sources)),
    fields: records(content.fields) as Extract<Operation, { kind: "table.create" }>["fields"],
    ...optional("relations", relations),
  };
}

/** Opérations des propositions de données : la table, le jeu, ou les mises à jour de relations des tables enregistrées. */
function dataOperations(proposal: ProposalOutput): Operation[] {
  const { content } = proposal;
  if (proposal.kind === "table") return [tableOperation(proposal)];
  if (proposal.kind === "fixtures") {
    const locale = str(content.locale);
    return [
      {
        kind: "fixture.create",
        title: str(content.title).trim(),
        table: str(content.table),
        ...optional("locale", locale || undefined),
        rows: records(content.rows) as Extract<Operation, { kind: "fixture.create" }>["rows"],
      },
    ];
  }
  return records(content.updates).map((update) => ({
    kind: "table.update" as const,
    specId: str(update.specId),
    relations: relationsOf(update.relations),
  }));
}

/** Opérations d'une proposition acceptée (une seule, sauf `relations` : une mise à jour par table de départ). */
export function operationsOf(proposal: ProposalOutput): Operation[] {
  if (isDataKind(proposal.kind)) return dataOperations(proposal);
  const op = operationOf(proposal);
  return op ? [op] : [];
}

/**
 * Opération d'une proposition acceptée : `feature` crée une fonctionnalité, `criteria` ajoute des critères à une
 * fonctionnalité existante (B314 d), `rule`, `role` et `flow` créent l'élément (TK-103).
 */
export function operationOf(proposal: ProposalOutput): Operation | null {
  const { content } = proposal;
  if (proposal.kind === "rule") return ruleOperation(content);
  if (proposal.kind === "role") return roleOperation(content);
  if (proposal.kind === "flow") return flowOperation(content);
  if (proposal.kind === "feature") {
    return {
      kind: "feature.create",
      title: str(content.title).trim(),
      priority: str(content.priority) as "must" | "should" | "could" | "wont",
      description: str(content.description),
      ...optional("zone", proposal.zone.trim().slice(0, ZONE_MAX) || undefined),
      criteria: criteriaOf(content),
    };
  }
  if (proposal.kind === "criteria") {
    return { kind: "feature.update", specId: str(content.specId), criteria: criteriaOf(content) };
  }
  return null;
}

/** Acceptée, pas encore appliquée par un lot, et enregistrable. */
export const isSavable = (proposal: ProposalOutput): boolean =>
  proposal.status === "accepted" &&
  proposal.appliedBatchId === null &&
  operationsOf(proposal).length > 0;

const slug = (text: string): string =>
  text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 24) || "g";

function fingerprint(ids: string[]): string {
  let hash = 5381;
  for (const char of ids.join(",")) hash = ((hash << 5) + hash + char.charCodeAt(0)) >>> 0;
  return hash.toString(36);
}

/**
 * Octets d'opérations par lot : les trois quarts du plafond de l'API, le reste couvre l'enveloppe (clé, identifiants
 * des propositions) et l'échappement JSON.
 */
export const BATCH_BYTES_BUDGET = Math.floor((SPEC_BATCH_MAX_BODY_BYTES * 3) / 4);

const encoder = new TextEncoder();
const bytesOf = (proposal: ProposalOutput): number =>
  encoder.encode(JSON.stringify(operationsOf(proposal))).length;

/** Coupe une suite en tranches de 200 opérations et de `BATCH_BYTES_BUDGET` octets au plus, dans l'ordre. */
function slices(items: ProposalOutput[], budget: number): ProposalOutput[][] {
  const out: ProposalOutput[][] = [];
  let current: ProposalOutput[] = [];
  let size = 0;
  let count = 0;
  for (const item of items) {
    const bytes = bytesOf(item);
    const ops = operationsOf(item).length;
    const full = count + ops > SPEC_BATCH_OPERATIONS_MAX || size + bytes > budget;
    if (current.length > 0 && full) {
      out.push(current);
      current = [];
      size = 0;
      count = 0;
    }
    current.push(item);
    size += bytes;
    count += ops;
  }
  if (current.length > 0) out.push(current);
  return out;
}

/**
 * Découpe l'enregistrement : jusqu'à 200 propositions, un seul lot ; au-delà, un lot par groupe
 * (`type:zone`), chacun de 200 au plus. Tout lot reste aussi sous `BATCH_BYTES_BUDGET` octets d'opérations, pour ne
 * jamais buter sur le plafond de l'API (413) avec des descriptions longues. Clé
 * `proposal-<lancement>-<groupe>-<n>-<empreinte>` : identique si le même lot est renvoyé (reprise après coupure),
 * différente dès que son contenu change.
 */
export function planBatches(
  launchId: string,
  proposals: ProposalOutput[],
  budget = BATCH_BYTES_BUDGET,
): BatchPlan[] {
  const chunks: Array<{ group: string; items: ProposalOutput[] }> = [];
  if (proposals.length <= SPEC_BATCH_OPERATIONS_MAX) {
    for (const items of slices(proposals, budget)) chunks.push({ group: "all", items });
  } else {
    const groups = new Map<string, ProposalOutput[]>();
    for (const item of proposals) {
      const key = `${item.kind}:${item.zone}`;
      groups.set(key, [...(groups.get(key) ?? []), item]);
    }
    for (const [group, items] of groups) {
      for (const slice of slices(items, budget)) chunks.push({ group, items: slice });
    }
  }
  return chunks.map(({ group, items }, index) => {
    const ids = items.map((item) => item.id);
    return {
      key: `proposal-${launchId}-${slug(group)}-${index + 1}-${fingerprint(ids)}`,
      operations: items.flatMap(operationsOf),
      proposalIds: ids,
    };
  });
}

import { SPEC_BATCH_OPERATIONS_MAX, type SpecBatchSubmitInput } from "@koklo/contract";
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
  operationOf(proposal) !== null;

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
 * Découpe l'enregistrement : jusqu'à 200 propositions, un seul lot ; au-delà, un lot par groupe
 * (`type:zone`), chacun de 200 au plus. Clé `proposal-<lancement>-<groupe>-<n>-<empreinte>` : identique si le même
 * lot est renvoyé (reprise après coupure), différente dès que son contenu change.
 */
export function planBatches(launchId: string, proposals: ProposalOutput[]): BatchPlan[] {
  const chunks: Array<{ group: string; items: ProposalOutput[] }> = [];
  if (proposals.length <= SPEC_BATCH_OPERATIONS_MAX) {
    chunks.push({ group: "all", items: proposals });
  } else {
    const groups = new Map<string, ProposalOutput[]>();
    for (const item of proposals) {
      const key = `${item.kind}:${item.zone}`;
      groups.set(key, [...(groups.get(key) ?? []), item]);
    }
    for (const [group, items] of groups) {
      for (let at = 0; at < items.length; at += SPEC_BATCH_OPERATIONS_MAX) {
        chunks.push({ group, items: items.slice(at, at + SPEC_BATCH_OPERATIONS_MAX) });
      }
    }
  }
  return chunks.map(({ group, items }, index) => {
    const ids = items.map((item) => item.id);
    return {
      key: `proposal-${launchId}-${slug(group)}-${index + 1}-${fingerprint(ids)}`,
      operations: items.map((item) => operationOf(item) as Operation),
      proposalIds: ids,
    };
  });
}

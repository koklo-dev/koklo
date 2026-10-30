import type { TicketCreateInput } from "@koklo/contract";
import {
  areDependenciesSatisfied,
  type CreateTicketInput,
  createDependencyGraph,
  createTicket,
  type Dependency,
  type Ticket,
  withTicketChanges,
} from "@koklo/domain";
import { viaDomain } from "../tracker/api-errors.ts";
import type {
  Holder,
  NewTicket,
  TicketChanges,
  TicketRecord,
  TicketStore,
} from "./ticket.repository.ts";

/** Représentation de l'assignee dans le contrat (chaîne) et dans le domaine : `kind:id`. */
export const holderLabel = (holder: Holder): string => `${holder.kind}:${holder.id}`;

/** Ticket du domaine pour un enregistrement lu en base (le domaine valide les champs). */
export function toDomainTicket(record: TicketRecord): Ticket {
  const ticket = viaDomain(() =>
    createTicket({
      key: record.key,
      title: record.title,
      description: record.description,
      type: record.type,
      priority: record.priority,
      sprint: record.sprintKey,
      assignee: record.assignee && holderLabel(record.assignee),
      pkg: record.pkg,
      labels: record.labels,
      sensitivity: record.sensitivity,
      estimateHours: record.estimateHours,
      linkedFeatures: record.linkedFeatures,
      branch: record.branch,
      pullRequest: record.pullRequest,
      attempts: record.attempts,
      reviewRounds: record.reviewRounds,
      createdAt: record.createdAt.toISOString(),
    }),
  );
  // `createTicket` ne crée qu'en backlog ou todo : le statut courant est reporté ensuite.
  return withTicketChanges(ticket, { status: record.status });
}

/**
 * Règle de dépendances du CDC §7.2 : un ticket ne démarre pas tant qu'une dépendance `blocks`
 * n'est pas `done`. Les cibles supprimées sont déjà absentes de `dependenciesOf` (H6).
 */
export async function dependenciesAreSatisfied(
  store: TicketStore,
  record: TicketRecord,
): Promise<boolean> {
  const { edges, targets } = await store.dependenciesOf(record.id);
  const byKey = new Map(targets.map((target) => [target.key, toDomainTicket(target)]));
  return areDependenciesSatisfied(toDomainTicket(record), createDependencyGraph(edges), byKey);
}

export const graphOf = (edges: readonly Dependency[]) => createDependencyGraph(edges);

/** Entrée de `createTicket` pour valider un ticket existant une fois les changements appliqués. */
export function mergedForValidation(
  current: TicketRecord,
  changes: Omit<TicketChanges, "sprintId">,
) {
  const assignee = changes.assignee ?? current.assignee;
  return {
    key: current.key,
    title: changes.title ?? current.title,
    description: changes.description ?? current.description,
    type: current.type,
    priority: changes.priority ?? current.priority,
    pkg: changes.pkg ?? current.pkg,
    sensitivity: changes.sensitivity ?? current.sensitivity,
    sprint: current.sprintKey,
    assignee: assignee && holderLabel(assignee),
    labels: changes.labels ?? current.labels,
    estimateHours: changes.estimateHours ?? current.estimateHours,
    linkedFeatures: changes.linkedFeatures ?? current.linkedFeatures,
    createdAt: current.createdAt.toISOString(),
  };
}

/** Copie sans les champs `undefined` (un champ omis du contrat reste inchangé en base). */
export const definedOnly = <T extends object>(fields: T): Partial<T> =>
  Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== undefined),
  ) as Partial<T>;

/** Entrée de `createTicket` pour une demande de création (le domaine valide chaque champ). */
export const creationInput = (key: string, input: TicketCreateInput): CreateTicketInput => ({
  key,
  title: input.title,
  description: input.description,
  type: input.type,
  priority: input.priority,
  pkg: input.pkg,
  sensitivity: input.sensitivity,
  status: input.status,
  sprint: input.sprintId,
  assignee: input.assignee && holderLabel(input.assignee),
  labels: input.labels,
  estimateHours: input.estimateHours,
  linkedFeatures: input.linkedFeatures,
  createdAt: new Date().toISOString(),
});

/** Ligne à insérer : champs validés par le domaine, assignee et critères repris de la demande. */
export const newTicketOf = (
  ticket: Ticket,
  input: TicketCreateInput,
  sprintId: string | null,
): NewTicket => ({
  key: ticket.key,
  title: ticket.title,
  description: ticket.description,
  type: ticket.type,
  priority: ticket.priority,
  pkg: ticket.pkg,
  sensitivity: ticket.sensitivity,
  status: ticket.status as "backlog" | "todo",
  estimateHours: ticket.estimateHours,
  assignee: input.assignee ?? null,
  labels: [...ticket.labels],
  linkedFeatures: [...ticket.linkedFeatures],
  sprintId,
  criteria: (input.criteria ?? []).map((c) => ({
    statement: c.statement,
    specRef: c.specRef ?? null,
  })),
});

import type {
  TicketCreateInput,
  TicketDetail,
  TicketOutput,
  TicketTransitionInput,
} from "@koklo/contract";
import {
  addDependency,
  assertNoPackageLabel,
  createTicket,
  dependenciesOf,
  formatTicketKey,
  transitionTicket,
} from "@koklo/domain";
import { Inject, Injectable } from "@nestjs/common";
import { canSeeWorktree } from "../auth/roles.ts";
import {
  conflict,
  invalidTransition,
  notFound,
  orNotFound,
  validation,
  viaDomain,
} from "../tracker/api-errors.ts";
import { DEFAULT_PAGE_SIZE } from "../tracker/cursor.ts";
import type { ProjectScope } from "../tracker/scope.ts";
import {
  TICKET_REPOSITORY,
  type TicketChanges,
  type TicketFilter,
  type TicketPage,
  type TicketRecord,
  type TicketRepository,
  type TicketStore,
} from "./ticket.repository.ts";
import {
  creationInput,
  definedOnly,
  dependenciesAreSatisfied,
  graphOf,
  mergedForValidation,
  newTicketOf,
  toDomainTicket,
} from "./ticket-domain.ts";
import { toTicketDetail, toTicketOutput } from "./ticket-output.ts";

/** Champs de `ticket.update` : `sprintId` est la clé `SP-n` du contrat. */
type UpdateFields = Omit<TicketChanges, "sprintId"> & { sprintId?: string };

const requireTicket = async (store: TicketStore, key: string): Promise<TicketRecord> =>
  orNotFound(await store.find(key));

type DependencyRequest = { key: string; dependsOn: string; type: "blocks" | "related" };

/** Les deux extrémités d'une dépendance doivent exister dans le projet courant. */
async function requireEnds(store: TicketStore, input: DependencyRequest) {
  const source = await requireTicket(store, input.key);
  const target = await requireTicket(store, input.dependsOn);
  return { source, target };
}

/** Un ticket se rattache à un sprint du même projet, planned ou active (H5, H9). */
async function openSprintId(store: TicketStore, sprintKey: string): Promise<string> {
  const sprint = await store.findSprint(sprintKey);
  if (!sprint) {
    throw validation("sprintId", `sprint inconnu : ${sprintKey}`);
  }
  if (sprint.status === "closed") {
    throw validation("sprintId", `le sprint ${sprintKey} est clos`);
  }
  return sprint.id;
}

/** Cas d'usage des tickets et de leurs dépendances : le domaine décide, l'API orchestre et persiste. */
@Injectable()
export class TicketService {
  constructor(@Inject(TICKET_REPOSITORY) private readonly repository: TicketRepository) {}

  create(scope: ProjectScope, input: TicketCreateInput): Promise<TicketOutput> {
    return this.repository.run(scope, async (store) => {
      viaDomain(() => assertNoPackageLabel(input.labels));
      const sprintId = input.sprintId ? await openSprintId(store, input.sprintId) : null;
      const key = formatTicketKey(await store.nextNumber());
      const ticket = viaDomain(() => createTicket(creationInput(key, input)));
      const record = await store.insert(newTicketOf(ticket, input, sprintId));
      await store.audit("ticket.create", record.id);
      return toTicketOutput(record);
    });
  }

  get(scope: ProjectScope, key: string, role: string | undefined): Promise<TicketDetail> {
    return this.repository.run(scope, async (store) => {
      const record = await requireTicket(store, key);
      const { edges } = await store.dependenciesOf(record.id);
      return toTicketDetail(
        record,
        {
          criteria: await store.criteria(record.id),
          dependencies: dependenciesOf(graphOf(edges), record.key),
          lease: await store.activeLease(record.id),
        },
        canSeeWorktree(role),
      );
    });
  }

  list(
    scope: ProjectScope,
    filter: TicketFilter,
    limit = DEFAULT_PAGE_SIZE,
    cursor?: string,
  ): Promise<{ items: TicketOutput[]; nextCursor: TicketPage["nextCursor"] }> {
    return this.repository.run(scope, async (store) => {
      const page = await store.list(filter, limit, cursor);
      return { items: page.items.map(toTicketOutput), nextCursor: page.nextCursor };
    });
  }

  update(scope: ProjectScope, key: string, fields: UpdateFields): Promise<TicketOutput> {
    return this.repository.run(scope, async (store) => {
      viaDomain(() => assertNoPackageLabel(fields.labels));
      const current = await requireTicket(store, key);
      const { sprintId: sprintKey, ...columns } = fields;
      const sprintId = sprintKey ? await openSprintId(store, sprintKey) : undefined;
      // Le domaine valide l'ensemble fusionné ; on n'écrit ensuite que les champs fournis.
      viaDomain(() => createTicket(mergedForValidation(current, columns)));
      const record = await store.update(current.id, { ...definedOnly(columns), sprintId });
      await store.audit("ticket.update", record.id);
      return toTicketOutput(record);
    });
  }

  delete(scope: ProjectScope, key: string): Promise<{ key: string }> {
    return this.repository.run(scope, async (store) => {
      const record = await requireTicket(store, key);
      if (await store.hasActiveLease(record.id)) {
        throw conflict("ticket_has_active_lease");
      }
      await store.softDelete(record.id);
      await store.audit("ticket.delete", record.id);
      return { key: record.key };
    });
  }

  transition(scope: ProjectScope, input: TicketTransitionInput): Promise<TicketOutput> {
    return this.repository.run(scope, async (store) => {
      const record = await requireTicket(store, input.key);
      // Table H1 d'abord, puis règle CDC §7.2 : on ne démarre pas avec une dépendance bloquante ouverte.
      viaDomain(() => transitionTicket(toDomainTicket(record), input.to));
      if (
        record.status === "todo" &&
        input.to === "in_progress" &&
        !(await dependenciesAreSatisfied(store, record))
      ) {
        throw invalidTransition(record.status, input.to);
      }
      const updated = await store.setStatus(record.id, input.to);
      await store.audit("ticket.transition", updated.id);
      return toTicketOutput(updated);
    });
  }

  addDependency(scope: ProjectScope, input: DependencyRequest) {
    return this.repository.run(scope, async (store) => {
      const { source, target } = await requireEnds(store, input);
      const graph = graphOf(await store.projectEdges());
      const edge = { ticket: source.key, dependsOn: target.key, type: input.type };
      const next = viaDomain(() => addDependency(graph, edge));
      if (next !== graph) {
        await store.addEdge(source.id, target.id, input.type);
        await store.audit("dependency.add", source.id);
      }
      return edge;
    });
  }

  removeDependency(scope: ProjectScope, input: DependencyRequest) {
    return this.repository.run(scope, async (store) => {
      const { source, target } = await requireEnds(store, input);
      if (!(await store.removeEdge(source.id, target.id, input.type))) {
        throw notFound();
      }
      await store.audit("dependency.remove", source.id);
      return input;
    });
  }

  listDependencies(scope: ProjectScope, key: string) {
    return this.repository.run(scope, async (store) => {
      const record = await requireTicket(store, key);
      const { edges } = await store.dependenciesOf(record.id);
      return [...dependenciesOf(graphOf(edges), record.key)];
    });
  }
}

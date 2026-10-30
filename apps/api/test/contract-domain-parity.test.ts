import * as contract from "@koklo/contract";
import * as domain from "@koklo/domain";
import { describe, expect, it } from "vitest";

/**
 * Parité contrat <-> domaine (TK-29). Le contrat ne peut pas dépendre du domaine
 * (`turbo boundaries` : contract -> config seulement) et domain -> contract est refusé
 * transitivement par l'étiquette db ; ce test vit donc dans l'api, qui voit les deux.
 */
type Enum = { readonly options: readonly string[] };
type Standard = { "~standard": { validate(v: unknown): unknown } };
const options = (schema: unknown) => [...(schema as Enum).options];
const accepts = (schema: unknown, value: unknown) =>
  ((schema as Standard)["~standard"].validate(value) as { issues?: unknown[] }).issues ===
  undefined;

describe("P1 énumérations identiques au domaine", () => {
  const pairs: [string, unknown, readonly string[]][] = [
    ["ticketStatusSchema", contract.ticketStatusSchema, domain.TICKET_STATUSES],
    ["ticketTypeSchema", contract.ticketTypeSchema, domain.TICKET_TYPES],
    ["ticketPrioritySchema", contract.ticketPrioritySchema, domain.TICKET_PRIORITIES],
    ["ticketPackageSchema", contract.ticketPackageSchema, domain.TICKET_PACKAGES],
    ["sensitivitySchema", contract.sensitivitySchema, domain.SENSITIVITIES],
    ["dependencyTypeSchema", contract.dependencyTypeSchema, domain.DEPENDENCY_TYPES],
  ];
  it.each(pairs)("%s liste les mêmes valeurs que le domaine", (_name, schema, values) => {
    expect(schema).toBeDefined();
    expect(options(schema).sort()).toEqual([...values].sort());
  });
  it("holderKindSchema liste member et runner (Holder du domaine)", () => {
    const holders = [domain.acquireLease([], lease("R1", "runner"), NOW).lease.holder.kind];
    expect(options(contract.holderKindSchema).sort()).toEqual(["member", "runner"]);
    for (const kind of holders) expect(accepts(contract.holderKindSchema, kind)).toBe(true);
  });
});

const NOW = "2026-01-01T10:00:00.000Z";
const lease = (id: string, kind: "member" | "runner") => ({
  ticket: "TK-1",
  holder: { kind, id },
  branch: "feat/tk-1",
  worktree: "/work/tk-1",
});

describe("P2 formes de sortie acceptent les objets du domaine", () => {
  it("ticketSchema accepte createTicket(...) avec un id", () => {
    const ticket = domain.createTicket({
      key: "TK-1",
      title: "Parité",
      type: "feature",
      priority: "medium",
      pkg: "contract",
      sensitivity: "safe",
      createdAt: NOW,
    });
    const id = "123e4567-e89b-42d3-a456-426614174000";
    expect(accepts(contract.ticketSchema, { ...ticket, id })).toBe(true);
    expect(accepts(contract.ticketSchema, { ...ticket, id, pkg: ["web", "api"] })).toBe(false);
  });
  it.each(["member", "runner"] as const)(
    "leaseSchema accepte acquireLease(...) pour %s",
    (kind) => {
      const { lease: taken } = domain.acquireLease([], lease("H1", kind), NOW);
      expect(accepts(contract.leaseSchema, taken)).toBe(true);
      expect(accepts(contract.leaseSchema, domain.release(taken, taken.holder))).toBe(true);
    },
  );
  it("projectStateSchema accepte createProjectState et writeProjectState", () => {
    const first = domain.createProjectState({ a: 1 });
    const second = domain.writeProjectState(first, 1, { a: 2 });
    expect(accepts(contract.projectStateSchema, first)).toBe(true);
    expect(accepts(contract.projectStateSchema, second)).toBe(true);
  });
  it("dependencySchema accepte une arête du domaine", () => {
    const graph = domain.addDependency(domain.createDependencyGraph(), {
      ticket: "TK-2",
      dependsOn: "TK-1",
      type: "blocks",
    });
    for (const edge of domain.dependencyEdges(graph)) {
      expect(accepts(contract.dependencySchema, edge)).toBe(true);
    }
  });
});

describe("P3 chaque erreur nommée du domaine a son code contractuel", () => {
  const MAPPING: [string, string, string][] = [
    ["InvalidTicketTransitionError", "INVALID_TRANSITION", "ticket.transition"],
    ["DependencyCycleError", "DEPENDENCY_CYCLE", "dependency.add"],
    ["StaleProjectStateError", "VERSION_CONFLICT", "projectState.update"],
    ["LeaseAlreadyHeldError", "LEASE_HELD", "lease.acquire"],
    ["LeaseExpiredError", "LEASE_EXPIRED", "lease.heartbeat"],
    ["LeaseNotHeldByError", "LEASE_NOT_HOLDER", "lease.heartbeat"],
    ["InvalidTicketError", "VALIDATION", "ticket.create"],
    ["TicketPackageError", "VALIDATION", "ticket.create"],
    ["InvalidSensitivityError", "VALIDATION", "ticket.create"],
  ];
  const errorMap = (path: string) => {
    let node: unknown = contract.contract;
    for (const part of path.split(".")) node = (node as Record<string, unknown>)?.[part];
    return (node as { "~orpc": { errorMap: Record<string, unknown> } })?.["~orpc"].errorMap ?? {};
  };
  it.each(MAPPING)("%s -> %s sur %s", (className, code, route) => {
    expect(typeof (domain as Record<string, unknown>)[className], className).toBe("function");
    expect(errorMap(route)[code], `${route} ${code}`).toBeDefined();
  });
  it("les data contractuelles valident les champs des erreurs réelles", () => {
    const data = (route: string, code: string) =>
      (errorMap(route)[code] as { data: unknown } | undefined)?.data;
    const transition = new domain.InvalidTicketTransitionError("done", "todo");
    expect(accepts(data("ticket.transition", "INVALID_TRANSITION"), transition)).toBe(true);
    const cycle = new domain.DependencyCycleError(["TK-1", "TK-2", "TK-1"]);
    expect(accepts(data("dependency.add", "DEPENDENCY_CYCLE"), cycle)).toBe(true);
    const state = domain.createProjectState({});
    const stale = new domain.StaleProjectStateError(state, 3);
    expect(accepts(data("projectState.update", "VERSION_CONFLICT"), stale)).toBe(true);
    const { lease: held } = domain.acquireLease([], lease("R1", "runner"), NOW);
    const heldError = new domain.LeaseAlreadyHeldError(held);
    expect(
      accepts(data("lease.acquire", "LEASE_HELD"), { ...heldError.lease, ticket: "TK-1" }),
    ).toBe(true);
    const invalid = new domain.InvalidTicketError("title", "titre non vide requis");
    expect(
      accepts(data("ticket.create", "VALIDATION"), {
        field: invalid.field,
        message: invalid.message,
      }),
    ).toBe(true);
  });
});

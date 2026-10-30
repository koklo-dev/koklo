import { assertNoPackageLabel, createTicket } from "@koklo/domain";
import type { ImportedTicket } from "../ticket/ticket.repository.ts";
import type { ParsedTicket } from "./parsed-sprint.ts";

/** Le domaine valide chaque champ comme pour `ticket.create` ; un refus est rapporté, pas ignoré. */
export function validationError(ticket: ParsedTicket): string | null {
  try {
    assertNoPackageLabel(ticket.labels);
    createTicket({
      key: ticket.key,
      title: ticket.title,
      description: ticket.description,
      type: "task",
      priority: "medium",
      pkg: ticket.pkg,
      sensitivity: ticket.sensitivity,
      status: "todo",
      labels: ticket.labels,
      createdAt: new Date().toISOString(),
    });
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : "ticket invalide";
  }
}

export const toImported = (ticket: ParsedTicket, sprintId: string): ImportedTicket => ({
  key: ticket.key,
  title: ticket.title,
  description: ticket.description,
  type: "task",
  priority: "medium",
  pkg: ticket.pkg,
  sensitivity: ticket.sensitivity,
  estimateHours: null,
  assignee: null,
  labels: ticket.labels,
  linkedFeatures: [],
  status: ticket.state,
  sprintId,
  criteria: ticket.criteria.map((c) => ({
    statement: c.statement,
    specRef: null,
    proven: c.proven,
  })),
});

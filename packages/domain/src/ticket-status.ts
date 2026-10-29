import { isOneOf } from "./one-of.ts";

export const TICKET_STATUSES = [
  "backlog",
  "todo",
  "in_progress",
  "in_review",
  "blocked",
  "done",
  "cancelled",
] as const;

export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const isTicketStatus = (value: unknown): value is TicketStatus =>
  isOneOf(TICKET_STATUSES, value);

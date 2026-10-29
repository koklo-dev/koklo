import { InvalidTicketError } from "./errors.ts";
import { isOneOf } from "./one-of.ts";
import { parseTicketKey } from "./ticket-key.ts";
import { parseTicketPackage, type TicketPackage } from "./ticket-package.ts";
import { parseSensitivity, type Sensitivity } from "./ticket-sensitivity.ts";
import type { TicketStatus } from "./ticket-status.ts";

export const TICKET_TYPES = ["feature", "bug", "task", "chore"] as const;
export const TICKET_PRIORITIES = ["low", "medium", "high", "critical"] as const;

export type TicketType = (typeof TICKET_TYPES)[number];
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];

export type Ticket = {
  readonly key: string;
  readonly title: string;
  readonly description: string;
  readonly type: TicketType;
  readonly status: TicketStatus;
  readonly priority: TicketPriority;
  readonly sprint: string | null;
  readonly assignee: string | null;
  readonly pkg: TicketPackage;
  readonly labels: readonly string[];
  readonly sensitivity: Sensitivity;
  readonly estimateHours: number | null;
  readonly linkedFeatures: readonly string[];
  readonly branch: string | null;
  readonly pullRequest: string | null;
  readonly attempts: number;
  readonly reviewRounds: number;
  readonly createdAt: string;
};

export type CreateTicketInput = {
  readonly key: string;
  readonly title: string;
  readonly type: TicketType;
  readonly priority: TicketPriority;
  readonly pkg: TicketPackage;
  readonly sensitivity: Sensitivity;
  /** Instant ISO-8601 UTC (`YYYY-MM-DDTHH:mm:ss[.sss]Z`), conservé tel quel. */
  readonly createdAt: string;
  readonly description?: string;
  readonly status?: "backlog" | "todo";
  readonly sprint?: string | null;
  readonly assignee?: string | null;
  readonly labels?: readonly string[];
  readonly estimateHours?: number | null;
  readonly linkedFeatures?: readonly string[];
  readonly branch?: string | null;
  readonly pullRequest?: string | null;
  readonly attempts?: number;
  readonly reviewRounds?: number;
};

const INITIAL_STATUSES = ["backlog", "todo"] as const;

const fail = (field: string, message: string): never => {
  throw new InvalidTicketError(field, message);
};

/** Convertit une erreur de valeur du domaine (clé, paquet, sensibilité) en erreur de champ. */
const asField = <T>(field: string, parse: () => T): T => {
  try {
    return parse();
  } catch (error) {
    return fail(field, (error as Error).message);
  }
};

const oneOf = <T extends string>(field: string, list: readonly T[], value: unknown): T =>
  isOneOf(list, value) ? value : fail(field, `valeur hors liste : ${String(value)}`);

const nullableString = (field: string, value: unknown): string | null => {
  if (value === undefined || value === null) return null;
  return typeof value === "string" ? value : fail(field, "chaîne attendue");
};

const stringList = (field: string, value: unknown): readonly string[] => {
  if (value === undefined) return Object.freeze([]);
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    return fail(field, "liste de chaînes attendue");
  }
  return Object.freeze([...value]);
};

const parseCounter = (field: string, value: unknown): number => {
  if (value === undefined) return 0;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    return fail(field, "entier >= 0 attendu");
  }
  return value;
};

const parseEstimate = (value: unknown): number | null => {
  if (value === undefined || value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return fail("estimateHours", "nombre fini >= 0 attendu");
  }
  return value;
};

const INSTANT_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{3})?Z$/;

/** Instant ISO-8601 UTC dont la date calendaire existe réellement. */
const parseCreatedAt = (value: unknown): string => {
  const match = typeof value === "string" ? INSTANT_PATTERN.exec(value) : null;
  if (!match) return fail("createdAt", "instant ISO-8601 UTC requis");
  const [year, month, day, hour, minute, second] = match.slice(1).map(Number) as [
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  const real =
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day &&
    hour < 24 &&
    minute < 60 &&
    second < 60;
  return real ? (value as string) : fail("createdAt", "date calendaire inexistante");
};

const parseTitle = (value: unknown): string =>
  typeof value === "string" && value.trim() !== "" ? value : fail("title", "titre non vide requis");

const parseDescription = (value: unknown): string => {
  if (value === undefined) return "";
  return typeof value === "string" ? value : fail("description", "chaîne attendue");
};

const parseInitialStatus = (value: unknown): "backlog" | "todo" =>
  value === undefined ? "backlog" : oneOf("status", INITIAL_STATUSES, value);

export const createTicket = (input: CreateTicketInput): Ticket => {
  asField("key", () => parseTicketKey(input.key));
  return Object.freeze({
    key: input.key,
    title: parseTitle(input.title),
    description: parseDescription(input.description),
    type: oneOf("type", TICKET_TYPES, input.type),
    status: parseInitialStatus(input.status),
    priority: oneOf("priority", TICKET_PRIORITIES, input.priority),
    sprint: nullableString("sprint", input.sprint),
    assignee: nullableString("assignee", input.assignee),
    pkg: asField("pkg", () => parseTicketPackage(input.pkg)),
    labels: stringList("labels", input.labels),
    sensitivity: asField("sensitivity", () => parseSensitivity(input.sensitivity)),
    estimateHours: parseEstimate(input.estimateHours),
    linkedFeatures: stringList("linkedFeatures", input.linkedFeatures),
    branch: nullableString("branch", input.branch),
    pullRequest: nullableString("pullRequest", input.pullRequest),
    attempts: parseCounter("attempts", input.attempts),
    reviewRounds: parseCounter("reviewRounds", input.reviewRounds),
    createdAt: parseCreatedAt(input.createdAt),
  });
};

/** Copie gelée d'un ticket avec quelques champs remplacés (aucune mutation de l'entrée). */
export const withTicketChanges = (ticket: Ticket, changes: Partial<Ticket>): Ticket =>
  Object.freeze({ ...ticket, ...changes });

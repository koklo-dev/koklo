import { TicketPackageError } from "./errors.ts";
import { isOneOf } from "./one-of.ts";

export const TICKET_PACKAGES = [
  "web",
  "api",
  "worker",
  "contract",
  "db",
  "domain",
  "schema",
  "github",
  "rules",
  "delivery",
  "cli",
  "ui",
  "config",
  "e2e",
  "infra",
] as const;

export type TicketPackage = (typeof TICKET_PACKAGES)[number];

const LABEL_PREFIX = "pkg:";

const isTicketPackage = (value: unknown): value is TicketPackage => isOneOf(TICKET_PACKAGES, value);

/** Un ticket porte exactement un paquet : aucun, plusieurs ou inconnu sont refusés. */
export const parseTicketPackage = (value: unknown): TicketPackage => {
  if (value === undefined || value === "" || (Array.isArray(value) && value.length === 0)) {
    throw new TicketPackageError("none", value);
  }
  if (
    (Array.isArray(value) && value.length > 1) ||
    (typeof value === "string" && value.includes(","))
  ) {
    throw new TicketPackageError("multiple", value);
  }
  const candidate = Array.isArray(value) ? value[0] : value;
  if (!isTicketPackage(candidate)) throw new TicketPackageError("unknown", value);
  return candidate;
};

export const pkgFromLabels = (labels: readonly string[]): TicketPackage => {
  const packages = labels
    .filter((label) => label.startsWith(LABEL_PREFIX))
    .map((label) => label.slice(LABEL_PREFIX.length));
  return parseTicketPackage(packages);
};

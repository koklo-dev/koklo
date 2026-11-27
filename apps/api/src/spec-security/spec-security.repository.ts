import type { IncidentContact } from "@koklo/contract";
import type { IndexFailure } from "../spec-architecture/spec-architecture.repository.ts";
import type { Revision } from "../spec-read/spec-read.repository.ts";
import type { ListRequest, ListWindow } from "../tracker/long-list.ts";
import type { ProjectScope } from "../tracker/scope.ts";
import type { IndexRow } from "./security-values.ts";

export const SPEC_SECURITY_REPOSITORY = Symbol("SPEC_SECURITY_REPOSITORY");

export type SecurityKind =
  | "threat"
  | "sensitive"
  | "rights"
  | "asvs"
  | "security_summary"
  | "table"
  | "roles"
  | "environments"
  | "stack";

/** Entités lues à la révision, avec le commit indexé. */
export interface SecurityHead {
  readonly kind: "found";
  readonly rows: IndexRow[];
  readonly commitSha: string;
}

export interface ThreatRequest extends ListRequest {
  q?: string | undefined;
  filter?: "high" | "todo" | "ci" | undefined;
}

/** Page de menaces, plus toutes les menaces de la tête (comptes et surfaces, sans filtre). */
export interface ThreatPage {
  readonly kind: "page";
  readonly window: ListWindow<IndexRow>;
  readonly all: IndexRow[];
}

/** `null` : pas de dépôt de spec ou révision non indexée. */
export interface SpecSecurityRepository {
  head(
    scope: ProjectScope,
    revision: Revision,
    kinds: readonly SecurityKind[],
  ): Promise<IndexFailure | SecurityHead | null>;
  threatPage(
    scope: ProjectScope,
    revision: Revision,
    request: ThreatRequest,
  ): Promise<IndexFailure | ThreatPage | null>;
  /** Titres des fonctionnalités `ids` à la révision. */
  featureTitles(
    scope: ProjectScope,
    revision: Revision,
    ids: readonly string[],
  ): Promise<Map<string, string>>;
  projectName(scope: ProjectScope): Promise<string>;
  contact(scope: ProjectScope): Promise<IncidentContact | null>;
}

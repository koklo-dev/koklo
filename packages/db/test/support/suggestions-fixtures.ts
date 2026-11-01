import { randomUUID } from "node:crypto";
import type { TestDatabase } from "../../src/testing/test-database.ts";
import { insertCounter, insertScope, type Scope } from "./ticket-fixtures.ts";

/** Table ajoutée par TK-51b (propositions client `SG-n`, données non fiables). */
export const SUGGESTION_TABLES = ["suggestions"] as const;
export const SUGGESTION_MODELS = ["Suggestion"] as const;

export const SUGGESTION_SUFFIX = "_suggestions";
export const SUGGESTION_MIGRATION = "20261101100000_suggestions";
export const SUGGESTION_TABLE = "suggestions";

/** Valeurs d'enum attendues (ordre de déclaration). */
export const SUGGESTION_STATUSES = ["open", "accepted", "rejected", "withdrawn"] as const;
export const SUGGESTION_TARGET_KINDS = ["feature", "screen", "project"] as const;
export const COUNTER_NAMES_AFTER = "counter_name:ticket,sprint,feature,suggestion";
export const COUNTER_NAMES_BEFORE = "counter_name:ticket,sprint,feature";

/** Colonnes exactes de la table (`udt_name/is_nullable`). Aucun lien FK vers users (RGPD). */
export const SUGGESTION_COLUMNS = {
  author_role: "text/YES",
  author_user_id: "uuid/YES",
  base_sha: "text/YES",
  body: "text/NO",
  created_at: "timestamptz/NO",
  decided_at: "timestamptz/YES",
  decided_by_user_id: "uuid/YES",
  decision_note: "text/YES",
  id: "uuid/NO",
  key: "text/NO",
  organization_id: "uuid/NO",
  project_id: "uuid/NO",
  status: "suggestion_status/NO",
  target_kind: "suggestion_target_kind/NO",
  target_ref: "text/YES",
  updated_at: "timestamptz/NO",
} as const;

export const SHA40 = "a".repeat(40);
export const SHA64 = "b".repeat(64);

export async function suggestionScope(db: TestDatabase, label: string): Promise<Scope> {
  return insertScope(db, label);
}

export interface SuggestionOverrides {
  id?: string;
  organizationId?: string;
  projectId?: string;
  key?: string;
  targetKind?: string;
  targetRef?: string | null;
  body?: string;
  authorUserId?: string | null;
  authorRole?: string | null;
  baseSha?: string | null;
  status?: string;
  decidedByUserId?: string | null;
  decidedAt?: string | null;
  decisionNote?: string | null;
}

/** Insère une suggestion `open` valide ; chaque colonne est fournie explicitement. */
export async function insertSuggestion(
  db: Pick<TestDatabase, "query">,
  scope: Scope,
  o: SuggestionOverrides = {},
): Promise<string> {
  const id = o.id ?? randomUUID();
  const pick = <T>(value: T | undefined, fallback: T): T =>
    value === undefined ? fallback : value;
  await db.query(
    `INSERT INTO suggestions (id, organization_id, project_id, key, target_kind, target_ref, body,
       author_user_id, author_role, base_sha, status, decided_by_user_id, decided_at, decision_note,
       created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5::suggestion_target_kind, $6, $7, $8, $9, $10, $11::suggestion_status,
       $12, $13, $14, now(), now())`,
    [
      id,
      o.organizationId ?? scope.organizationId,
      o.projectId ?? scope.projectId,
      o.key ?? `SG-${Math.floor(Math.random() * 1_000_000) + 1}`,
      o.targetKind ?? "feature",
      pick(o.targetRef, o.targetKind === "project" ? null : "F-001"),
      o.body ?? "Ajouter un export CSV",
      pick(o.authorUserId, null),
      pick(o.authorRole, "client"),
      pick(o.baseSha, null),
      o.status ?? "open",
      pick(o.decidedByUserId, null),
      pick(o.decidedAt, null),
      pick(o.decisionNote, null),
    ],
  );
  return id;
}

/** Crée le compteur `suggestion` d'un projet (échoue tant que la valeur d'enum n'existe pas). */
export const insertSuggestionCounter = (
  db: Pick<TestDatabase, "query">,
  scope: Scope,
  lastValue = 0,
): Promise<void> => insertCounter(db, scope, "suggestion", lastValue);

import type { AgentProposalKind } from "@koklo/domain";
import { findSecretPaths, PROPOSAL_SCHEMAS, SECRET_REFUSAL_MESSAGE } from "@koklo/schema";
import { validation } from "../tracker/api-errors.ts";
import type { RevisedContent } from "./proposal.repository.ts";

const TITLE_MAX = 200;

/** Champ qui porte le titre : le nom (rôle, table, composant, opération, environnement), le parcours détaillé (flux), le rôle d'un choix, sinon `title`. */
const TITLE_FIELD: Partial<Record<AgentProposalKind, string>> = {
  role: "name",
  table: "name",
  component: "name",
  archflow: "flow",
  stack: "role",
  op: "name",
  env: "name",
};

/** Titre affiché d'une proposition : celui de son contenu (`name` pour un rôle, une table ou un composant), sinon l'ancien (critères, relations). */
export function titleOf(
  kind: AgentProposalKind,
  content: Record<string, unknown>,
  fallback: string,
) {
  const value = content[TITLE_FIELD[kind] ?? "title"];
  return typeof value === "string" && value.length > 0 ? value.slice(0, TITLE_MAX) : fallback;
}

/**
 * Contenu d'une proposition validé par le schéma de son type (texte brut compris) et sans valeur de secret (TK-115, B724) :
 * la sortie du modèle comme la correction d'un humain sont des données non fiables. `field` nomme le champ refusé, jamais le texte fautif.
 */
export function validContent(
  kind: AgentProposalKind,
  raw: unknown,
  field: string,
  fallbackTitle: string,
): RevisedContent {
  const parsed = PROPOSAL_SCHEMAS[kind].safeParse(raw);
  if (!parsed.success) throw validation(field, "Contenu invalide pour ce type de proposition.");
  const payload = parsed.data as Record<string, unknown>;
  if (findSecretPaths(payload).length > 0) throw validation(field, SECRET_REFUSAL_MESSAGE);
  return { title: titleOf(kind, payload, fallbackTitle), payload };
}

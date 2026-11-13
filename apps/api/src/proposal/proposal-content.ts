import type { AgentProposalKind } from "@koklo/domain";
import { PROPOSAL_SCHEMAS } from "@koklo/schema";
import { validation } from "../tracker/api-errors.ts";
import type { RevisedContent } from "./proposal.repository.ts";

const TITLE_MAX = 200;

/** Titre affiché d'une proposition : celui de son contenu (`name` pour un rôle ou une table), sinon l'ancien (critères, relations). */
export function titleOf(
  kind: AgentProposalKind,
  content: Record<string, unknown>,
  fallback: string,
) {
  const value = content[kind === "role" || kind === "table" ? "name" : "title"];
  return typeof value === "string" && value.length > 0 ? value.slice(0, TITLE_MAX) : fallback;
}

/**
 * Contenu d'une proposition validé par le schéma de son type (texte brut compris) : la sortie du modèle comme la
 * correction d'un humain sont des données non fiables. `field` nomme le champ refusé, jamais le texte fautif.
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
  return { title: titleOf(kind, payload, fallbackTitle), payload };
}

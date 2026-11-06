import type { PrismaClient } from "./generated/client.ts";
import { currentOrganizationId, MissingOrganizationContextError } from "./tenant-context.ts";

/**
 * Recherche plein texte (TK-94, passation 07 §3). Le client multi-tenant refuse le SQL brut
 * (`RawQueryNotAllowedError`) et Prisma ne sait pas filtrer une colonne `tsvector` : cette fonction est
 * l'unique exception, volontairement étroite :
 *  - elle exige un contexte d'organisation (`withOrganization`) et filtre TOUJOURS sur lui ;
 *  - la table et la colonne de périmètre viennent d'une liste fermée, jamais de l'appelant ;
 *  - la saisie ne devient jamais de la syntaxe `tsquery` (voir `tsqueryOf`) et reste un paramètre lié ;
 *  - elle ne renvoie que des identifiants, que l'appelant relit ensuite par le client multi-tenant.
 */
export type SearchTarget = "ticket" | "specFeature";

/** Nombre maximal d'identifiants renvoyés (le total exact de la passation va jusqu'à 10 000). */
export const SEARCH_LIMIT = 10_000;

const WORD_SEPARATOR = /[^\p{L}\p{N}]+/u;

/**
 * Requête `tsquery` sûre : les mots de la saisie (lettres et chiffres seulement) sont tous exigés,
 * le dernier est un préfixe (« annul » trouve « annulation »). `null` quand rien n'est cherchable.
 */
export function tsqueryOf(input: string): string | null {
  const words = input.normalize("NFC").split(WORD_SEPARATOR).filter(Boolean);
  if (words.length === 0) return null;
  return words.map((word, index) => (index === words.length - 1 ? `${word}:*` : word)).join(" & ");
}

/**
 * Identifiants des lignes de `scopeId` (projet pour un ticket, instantané pour une fonctionnalité)
 * qui correspondent à `input`, dans l'organisation du contexte. Liste vide si rien n'est cherchable.
 */
export async function searchIds(
  raw: PrismaClient,
  target: SearchTarget,
  scopeId: string,
  input: string,
): Promise<string[]> {
  const organizationId = currentOrganizationId();
  if (!organizationId) {
    throw new MissingOrganizationContextError("Full-text search outside withOrganization");
  }
  const query = tsqueryOf(input);
  if (query === null) return [];
  const rows =
    target === "ticket"
      ? await raw.$queryRaw<{ id: string }[]>`
          SELECT id FROM tickets
           WHERE organization_id = ${organizationId}::uuid AND project_id = ${scopeId}::uuid
             AND deleted_at IS NULL AND search @@ to_tsquery('french', ${query})
           LIMIT ${SEARCH_LIMIT}`
      : await raw.$queryRaw<{ id: string }[]>`
          SELECT id FROM spec_features
           WHERE organization_id = ${organizationId}::uuid AND snapshot_id = ${scopeId}::uuid
             AND search @@ to_tsquery('french', ${query})
           LIMIT ${SEARCH_LIMIT}`;
  return rows.map((row) => row.id);
}

import type { Issue } from "../types.ts";

/** Un changement de fichier : écriture (contenu complet) ou suppression. Chemins relatifs à la racine de la spec. */
export type MigrationChange =
  | { readonly path: string; readonly content: string }
  | { readonly path: string; readonly delete: true };

/** Résultat d'une étape ou de la migration : jamais de changement s'il y a une issue (tout ou rien). */
export interface MigrationResult {
  readonly changes: MigrationChange[];
  readonly issues: Issue[];
}

export const writeOf = (path: string, content: string): MigrationChange => ({ path, content });
export const deleteOf = (path: string): MigrationChange => ({ path, delete: true });

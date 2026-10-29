interface Issue {
  path: readonly PropertyKey[];
  code: string;
}

/** Messages par champ puis par code d'issue Zod ; `default` couvre les autres codes du champ. */
export type FieldMessages = Record<string, Record<string, string> & { default: string }>;

/** Premier message d'erreur de chaque champ, tiré des issues du schéma Zod du contrat. */
export function fieldErrors(
  issues: readonly Issue[],
  messages: FieldMessages,
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const { path, code } of issues) {
    const field = String(path[0]);
    const byCode = messages[field];
    if (byCode && !(field in errors)) errors[field] = byCode[code] ?? byCode.default;
  }
  return errors;
}

export const NAME_TOO_LONG = "Le nom ne peut pas dépasser 100 caractères.";
export const RETRY_LATER = "Une erreur est survenue. Réessayez dans un instant.";
export const GENERIC_ERROR = "Une erreur est survenue. Vérifiez votre connexion puis réessayez.";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Vrai si la chaîne a la forme d'un UUID (les identifiants sont des UUID en base). */
export const isUuid = (value: string): boolean => UUID_RE.test(value);

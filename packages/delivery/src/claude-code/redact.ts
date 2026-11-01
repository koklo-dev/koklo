/** Redaction des secrets de tout ce qui sort de l'adaptateur (sortie, erreurs, partiel). */
export const REDACTED = "[redacted]";

/** Motifs de secrets connus : clés Anthropic, jetons GitHub, en-têtes `Bearer`. */
const SECRET_PATTERNS: readonly RegExp[] = [
  /sk-ant-[A-Za-z0-9_-]+/g,
  /github_pat_[A-Za-z0-9_]+/g,
  /gh[pousr]_[A-Za-z0-9]+/g,
  /Bearer\s+[A-Za-z0-9._~+/=-]+/g,
];

/**
 * Masque les secrets par motif puis les valeurs exactes connues (les plus longues d'abord ; une
 * valeur vide est ignorée). Idempotente : `[redacted]` ne correspond à aucun motif.
 */
export const redactSecrets = (text: string, knownSecrets: readonly string[] = []): string => {
  const known = knownSecrets.filter((secret) => secret !== "").sort((a, b) => b.length - a.length);
  let out = text;
  for (const secret of known) {
    out = out.split(secret).join(REDACTED);
  }
  for (const pattern of SECRET_PATTERNS) {
    out = out.replace(pattern, REDACTED);
  }
  return out;
};

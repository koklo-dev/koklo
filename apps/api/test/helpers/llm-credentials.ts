import { randomBytes } from "node:crypto";

/**
 * Clé BYOK sentinelle des tests TK-52 : clairement factice, construite à l'exécution (jamais de
 * chaîne ressemblant à une vraie clé de fournisseur dans le dépôt). Assez longue pour que ses
 * fragments et ses encodages soient reconnaissables.
 */
export const makeSentinel = (): string => `FAKE-KEY-NOT-REAL-${randomBytes(18).toString("hex")}`;

/** Les formes sous lesquelles une clé en clair pourrait traîner : UTF-8, base64 (3 alignements), hex. */
export function secretForms(secret: string): Buffer[] {
  const forms = [Buffer.from(secret, "utf8")];
  for (let pad = 0; pad < 3; pad += 1) {
    const encoded = Buffer.from("x".repeat(pad) + secret, "utf8").toString("base64");
    // Le milieu de l'encodage est indépendant des octets de bord (rembourrage et groupe de fin).
    forms.push(Buffer.from(encoded.slice(4, -4), "utf8"));
  }
  const hex = Buffer.from(secret, "utf8").toString("hex");
  forms.push(Buffer.from(hex, "utf8"), Buffer.from(hex.toUpperCase(), "utf8"));
  return forms;
}

/** Fragments de bord (début et fin) : une fuite partielle compte aussi. */
export const fragmentsOf = (secret: string): string[] => [secret.slice(0, 16), secret.slice(-16)];

export function containsSecret(haystack: Buffer | string, secret: string): boolean {
  const bytes = typeof haystack === "string" ? Buffer.from(haystack, "utf8") : haystack;
  return (
    secretForms(secret).some((form) => bytes.includes(form)) ||
    fragmentsOf(secret).some((fragment) => bytes.includes(Buffer.from(fragment, "utf8")))
  );
}

/** Aplatit des lignes SQL (colonnes bytea comprises) en octets, pour y chercher la clé. */
export function bytesOfRows(rows: readonly Record<string, unknown>[]): Buffer {
  const parts: Buffer[] = [];
  for (const row of rows) {
    for (const value of Object.values(row)) {
      parts.push(Buffer.isBuffer(value) ? value : Buffer.from(String(value), "utf8"));
      parts.push(Buffer.from("\u0000"));
    }
  }
  return Buffer.concat(parts);
}

import { escapePointerSegment } from "./pointer.ts";

/** Erreur typée : `path` est le pointeur JSON de la valeur non sérialisable. */
export class CanonicalizeError extends Error {
  readonly path: string;

  constructor(message: string, path: string) {
    super(`${message} (${path === "" ? "racine" : path})`);
    this.name = "CanonicalizeError";
    this.path = path;
  }
}

const INDENT = "  ";

function isPlainObject(value: object): boolean {
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function scalar(value: unknown, path: string): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new CanonicalizeError("nombre non fini", path);
    return JSON.stringify(value);
  }
  throw new CanonicalizeError(`type non sérialisable (${typeof value})`, path);
}

function container(value: object, path: string, depth: number, ancestors: Set<object>): string {
  if (ancestors.has(value)) throw new CanonicalizeError("référence circulaire", path);
  const isArray = Array.isArray(value);
  if (!isArray && !isPlainObject(value)) throw new CanonicalizeError("objet non simple", path);
  ancestors.add(value);
  const pad = INDENT.repeat(depth + 1);
  const entries = isArray
    ? value.map((item, i) => [String(i), item] as const)
    : Object.keys(value)
        .sort()
        .map((k) => [k, (value as Record<string, unknown>)[k]] as const)
        .filter(([, v]) => v !== undefined);
  const parts = entries.map(([key, item]) => {
    const text = write(item, `${path}/${escapePointerSegment(key)}`, depth + 1, ancestors);
    return isArray ? `${pad}${text}` : `${pad}${JSON.stringify(key)}: ${text}`;
  });
  ancestors.delete(value);
  const [open, close] = isArray ? ["[", "]"] : ["{", "}"];
  if (parts.length === 0) return `${open}${close}`;
  return `${open}\n${parts.join(",\n")}\n${INDENT.repeat(depth)}${close}`;
}

function write(value: unknown, path: string, depth: number, ancestors: Set<object>): string {
  if (value !== null && typeof value === "object") return container(value, path, depth, ancestors);
  return scalar(value, path);
}

/**
 * JSON canonique : clés triées (unités de code UTF-16), tableaux dans l'ordre, 2 espaces,
 * un unique `\n` final. Une propriété `undefined` est omise ; ailleurs, toute valeur non JSON
 * est refusée par une `CanonicalizeError`.
 */
export function canonicalize(value: unknown): string {
  return `${write(value, "", 0, new Set())}\n`;
}

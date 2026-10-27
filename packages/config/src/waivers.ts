import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parse } from "yaml";

export const WAIVERS_PATH = ".koklo/waivers.yaml";
export const FILE_LINES_RULE = "max-file-lines";

export interface Waiver {
  file: string;
  rule: string;
  justification: string;
  author: string;
  expires: string;
}

const FIELDS = ["file", "rule", "justification", "author", "expires"] as const;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function invalid(detail: string): Error {
  return new Error(`${WAIVERS_PATH} invalide : ${detail}`);
}

function toIsoDate(value: unknown): string | undefined {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? undefined : value.toISOString().slice(0, 10);
  }
  if (typeof value !== "string" || !ISO_DATE.test(value)) {
    return undefined;
  }
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value) ? value : undefined;
}

function readField(record: Record<string, unknown>, field: string, label: string): string {
  const raw = record[field];
  if (field === "expires" && raw !== undefined) {
    const date = toIsoDate(raw);
    if (date === undefined) {
      throw invalid(`${label}, champ expires illisible (attendu YYYY-MM-DD)`);
    }
    return date;
  }
  if (typeof raw !== "string" || raw.trim() === "") {
    throw invalid(`${label}, champ ${field} manquant ou vide`);
  }
  return raw;
}

function readEntry(raw: unknown, index: number): Waiver {
  const label = `entrée ${index + 1}`;
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw invalid(`${label} doit être un objet (${FIELDS.join(", ")})`);
  }
  const record = raw as Record<string, unknown>;
  return {
    file: readField(record, "file", label),
    rule: readField(record, "rule", label),
    justification: readField(record, "justification", label),
    author: readField(record, "author", label),
    expires: readField(record, "expires", label),
  };
}

async function readSource(root: string): Promise<string | null> {
  try {
    return await readFile(join(root, WAIVERS_PATH), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

/** Lit `.koklo/waivers.yaml` ; absent = aucune dérogation, invalide = erreur explicite. */
export async function loadWaivers(root: string): Promise<Waiver[]> {
  const source = await readSource(root);
  if (source === null) {
    return [];
  }
  let document: unknown;
  try {
    document = parse(source);
  } catch (error) {
    throw invalid(`YAML illisible (${(error as Error).message})`);
  }
  const list = (document as { waivers?: unknown } | null | undefined)?.waivers ?? [];
  if (!Array.isArray(list)) {
    throw invalid(`\`waivers\` doit être une liste d'entrées (${FIELDS.join(", ")})`);
  }
  return list.map(readEntry);
}

/** Une dérogation vaut jusqu'à la fin du jour `expires` inclus (UTC). */
export function isExpired(waiver: Waiver, today: Date): boolean {
  return today.toISOString().slice(0, 10) > waiver.expires;
}

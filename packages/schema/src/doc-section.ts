import { parse } from "yaml";
import { EmitError } from "./emit/errors.ts";
import { isOneLine } from "./emit/yaml-inline.ts";
import { splitFrontMatter } from "./parse/frontmatter.ts";

/**
 * Sections du document d'architecture `architecture/overview/NN-<slug>.md` (TK-111, B508) : jamais indexées en base,
 * lues en Git. Le statut vit dans le front matter (`statut: brouillon | a_relire | validee`) ; un corps vide est
 * « À rédiger », quel que soit le statut déclaré. Fonctions pures, sans I/O ; la lecture ne lève jamais.
 */
export const DOC_SECTION_DIR = "architecture/overview";
export const DOC_SECTION_STATUSES = ["brouillon", "a_relire", "validee", "a_rediger"] as const;
export type DocSectionStatus = (typeof DOC_SECTION_STATUSES)[number];

export interface DocSection {
  title: string;
  status: DocSectionStatus;
  markdown: string;
}

const FILE = /^architecture\/overview\/(\d{2,})-([a-z0-9][a-z0-9-]*)\.md$/;
const STORED = ["brouillon", "a_relire", "validee"] as const;

export class EmitDocSectionError extends EmitError {
  constructor(message: string, path: string) {
    super("EmitDocSectionError", message, path);
  }
}

export const docSectionPath = (num: number, slug: string): string =>
  `${DOC_SECTION_DIR}/${String(num).padStart(2, "0")}-${slug}.md`;

/** Numéro d'ordre et slug d'un chemin de section, `undefined` pour tout autre chemin. */
export function docSectionSlugOf(path: string): { num: number; slug: string } | undefined {
  const match = FILE.exec(path);
  return match === null ? undefined : { num: Number(match[1]), slug: match[2] as string };
}

function storedStatus(front: string): (typeof STORED)[number] {
  try {
    const value = (parse(front) as { statut?: unknown } | null)?.statut;
    return STORED.find((status) => status === value) ?? "brouillon";
  } catch {
    return "brouillon";
  }
}

/** Section lue : titre du premier `# `, statut, corps sans le titre (bordé). Ne lève jamais. */
export function parseDocSection(content: string): DocSection {
  const parts = splitFrontMatter(content);
  const lines = parts === undefined ? content.split(/\r?\n/) : parts.body;
  const heading = lines.findIndex((line) => /^# /.test(line));
  const title = heading < 0 ? "" : (lines[heading] as string).slice(2).trim();
  const body = (heading < 0 ? lines : lines.slice(heading + 1)).join("\n").trim();
  const status = body === "" ? "a_rediger" : storedStatus(parts?.front ?? "");
  return { title, status, markdown: body };
}

/** Section -> fichier : front matter fixe, titre, corps. `parseDocSection(emit(s))` rend `s` ; l'émission est idempotente. */
export function emitDocSection(section: DocSection): string {
  const title = section.title;
  if (title === "" || !isOneLine(title)) {
    throw new EmitDocSectionError("le titre tient sur une ligne non vide", "/title");
  }
  const status = section.status === "a_rediger" ? "brouillon" : section.status;
  const body = section.markdown.trim();
  const lines = [
    "---",
    `statut: ${status}`,
    "---",
    `# ${title}`,
    ...(body === "" ? [] : ["", body]),
  ];
  return `${lines.join("\n")}\n`;
}

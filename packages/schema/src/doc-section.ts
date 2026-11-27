import { parse } from "yaml";
import { EmitError } from "./emit/errors.ts";
import { isOneLine } from "./emit/yaml-inline.ts";
import { splitFrontMatter } from "./parse/frontmatter.ts";

/**
 * Sections d'un document en fichiers `NN-<slug>.md` : architecture (`architecture/overview/`, TK-111, B508) et cahier
 * technique (`tech/cahier-technique/`, TK-115, B723). Jamais indexées en base, lues en Git. Le statut vit dans le front
 * matter (`statut: brouillon | a_relire | validee`) ; un corps vide est « À rédiger », quel que soit le statut déclaré.
 * Fonctions pures, sans I/O ; la lecture ne lève jamais.
 */
export const DOC_SECTION_DELIVERABLES = ["architecture", "technical"] as const;
export type DocSectionDeliverable = (typeof DOC_SECTION_DELIVERABLES)[number];
export const DOC_SECTION_DIRS: Readonly<Record<DocSectionDeliverable, string>> = {
  architecture: "architecture/overview",
  technical: "tech/cahier-technique",
};
export const DOC_SECTION_DIR = DOC_SECTION_DIRS.architecture;
export const DOC_SECTION_STATUSES = ["brouillon", "a_relire", "validee", "a_rediger"] as const;
export type DocSectionStatus = (typeof DOC_SECTION_STATUSES)[number];

export interface DocSection {
  title: string;
  status: DocSectionStatus;
  markdown: string;
}

const FILE_NAME = /^(\d{2,})-([a-z0-9][a-z0-9-]*)\.md$/;
const STORED = ["brouillon", "a_relire", "validee"] as const;

export class EmitDocSectionError extends EmitError {
  constructor(message: string, path: string) {
    super("EmitDocSectionError", message, path);
  }
}

export const docSectionPath = (
  num: number,
  slug: string,
  deliverable: DocSectionDeliverable = "architecture",
): string => `${DOC_SECTION_DIRS[deliverable]}/${String(num).padStart(2, "0")}-${slug}.md`;

/** Numéro d'ordre et slug d'un chemin de section du livrable, `undefined` pour tout autre chemin. */
export function docSectionSlugOf(
  path: string,
  deliverable: DocSectionDeliverable = "architecture",
): { num: number; slug: string } | undefined {
  const dir = `${DOC_SECTION_DIRS[deliverable]}/`;
  const match = path.startsWith(dir) ? FILE_NAME.exec(path.slice(dir.length)) : null;
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

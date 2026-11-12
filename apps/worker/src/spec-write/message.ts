import { isIdeaKind } from "./paths.ts";
import type { BatchAuthor, BatchOperation } from "./types.ts";

const MAX_SUBJECT = 200;
const MAX_NAME = 100;
const EMAIL = /^[^\s<>@\p{Cc}]+@[^\s<>@\p{Cc}]+$/u;
const VERBS: Record<string, string> = { create: "créé", update: "modifié", delete: "supprimé" };

const CONTROL = /\p{Cc}/gu;
const LINE_BREAK = /[\r\n\u2028\u2029]/;
const firstLine = (text: string): string => text.split(LINE_BREAK, 1)[0] ?? "";

/** Nom d'affichage sur une seule ligne, sans `<`/`>` : un nom multi-lignes ne forge aucun trailer. */
function cleanName(name: string): string {
  return firstLine(name).replace(/[<>]/g, "").replace(CONTROL, "").trim().slice(0, MAX_NAME).trim();
}

/** `Co-authored-by` de l'auteur de la session, ou `undefined` (utilisateur supprimé, e-mail douteux). */
export function coAuthorLine(author: BatchAuthor | null): string | undefined {
  if (author === null) return undefined;
  const email = author.email.trim();
  if (!EMAIL.test(email)) return undefined;
  return `Co-authored-by: ${cleanName(author.name) || email} <${email}>`;
}

const plural = (count: number): string => `${count} page${count > 1 ? "s" : ""}`;

/** Objet par défaut : `spec: créé F-001, F-002 ; modifié F-003`, ou `idea: publié 3 pages`. */
export function defaultSubject(operations: readonly BatchOperation[]): string {
  if (operations.some((operation) => isIdeaKind(operation.kind))) {
    const written = operations.filter((operation) => operation.kind === "idea.page.write");
    return `idea: publié ${plural(written.length)}`;
  }
  const byVerb = new Map<string, string[]>();
  for (const operation of operations) {
    const verb = VERBS[operation.kind.split(".").pop() ?? ""] ?? "modifié";
    byVerb.set(verb, [...(byVerb.get(verb) ?? []), operation.targetSpecId ?? ""]);
  }
  const groups = [...byVerb].map(([verb, ids]) => `${verb} ${ids.join(", ")}`);
  return `spec: ${groups.join(" ; ")}`;
}

/** Une ligne par e-mail (casse ignorée), l'utilisateur de la session d'abord, puis les contributeurs. */
function coAuthorLines(authors: readonly (BatchAuthor | null)[]): string[] {
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const author of authors) {
    const line = coAuthorLine(author);
    const key = author?.email.trim().toLowerCase() ?? "";
    if (line === undefined || seen.has(key)) continue;
    seen.add(key);
    lines.push(line);
  }
  return lines;
}

/**
 * Message du commit : objet sur une ligne, ligne vide, puis le bloc de trailers écrit par le seul
 * serveur (`Koklo-Ops`, puis `Co-authored-by` de l'utilisateur de la session et des contributeurs).
 */
export function buildCommitMessage(input: {
  batchId: string;
  message: string | null;
  operations: readonly BatchOperation[];
  author: BatchAuthor | null;
  coAuthors?: readonly BatchAuthor[];
}): string {
  const custom = input.message === null ? "" : firstLine(input.message).replace(CONTROL, "").trim();
  const subject = (custom || defaultSubject(input.operations)).slice(0, MAX_SUBJECT);
  const trailers = [
    `Koklo-Ops: ${input.batchId}`,
    ...coAuthorLines([input.author, ...(input.coAuthors ?? [])]),
  ];
  return `${subject}\n\n${trailers.join("\n")}\n`;
}

/**
 * Le trailer `Koklo-Ops: <batchId>` n'est reconnu que dans le dernier paragraphe d'un message qui
 * en compte au moins deux : l'objet d'un commit ne peut pas en forger un.
 */
export function hasOpsTrailer(message: string, batchId: string): boolean {
  const paragraphs = message.trimEnd().split(/\n[ \t]*\n/);
  if (paragraphs.length < 2) return false;
  return (paragraphs.at(-1) ?? "")
    .split("\n")
    .some((line) => line.trimEnd() === `Koklo-Ops: ${batchId}`);
}

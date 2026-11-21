import { type Adr, AdrSchema } from "../entities/index.ts";
import { structIssue } from "../issue.ts";
import type { Issue } from "../types.ts";
import { splitFrontMatter } from "./frontmatter.ts";
import { sectionLines } from "./markdown-sections.ts";
import { loadYaml, tooLarge } from "./yaml.ts";
import { type EntityParse, parseWithSchema, rawId } from "./zod-issues.ts";

const BULLET = /^[-*]\s+(.+?)\s*$/;
const ALTERNATIVE = /^[-*]\s+\*\*(.+?)\*\*\s*:\s*(.+?)\s*$/;
const SUBSECTION = /^###\s+(.*?)\s*$/;
const POSITIVES = /^Positives?$/;
const TO_ACCEPT = /^[ÀA] accepter$/;

type Lines = readonly string[];
type Failure = { pointer: string; message: string };
type Parsed<T> = { value: T; errors: Failure[] };

const text = (lines: Lines | undefined): string => (lines ?? []).join("\n").trim();
const nonBlank = (lines: Lines | undefined): string[] =>
  (lines ?? []).filter((line) => line.trim() !== "");

type Consequences = { positives: string[]; a_accepter: string[] };

/** Liste qui reçoit les puces sous un titre `###` : Positives, À accepter, ou aucune (titre inconnu). */
const targetOf = (title: string, value: Consequences): string[] | undefined =>
  POSITIVES.test(title) ? value.positives : TO_ACCEPT.test(title) ? value.a_accepter : undefined;

/** Puces de `### Positives` et `### À accepter` ; tout autre titre ou ligne hors puce est une erreur. */
function parseConsequences(lines: Lines): Parsed<Consequences> {
  const value: Consequences = { positives: [], a_accepter: [] };
  const errors: Failure[] = [];
  const fail = (message: string) => errors.push({ pointer: "/consequences", message });
  let target: string[] | undefined;
  for (const line of nonBlank(lines)) {
    const title = SUBSECTION.exec(line)?.[1];
    const bullet = BULLET.exec(line)?.[1];
    if (title !== undefined) {
      target = targetOf(title, value);
      if (target === undefined) fail(`Sous-section inconnue : « ${title} ».`);
    } else if (bullet !== undefined && target !== undefined) target.push(bullet);
    else fail(`Ligne de conséquence sans puce ou hors sous-section : « ${line.trim()} ».`);
  }
  return { value, errors };
}

/** Une alternative par puce `- **Nom** : raison`. */
function parseAlternatives(lines: Lines | undefined): Parsed<{ nom: string; raison: string }[]> {
  const value: { nom: string; raison: string }[] = [];
  const errors: Failure[] = [];
  for (const line of nonBlank(lines)) {
    const match = ALTERNATIVE.exec(line);
    if (match?.[1] === undefined || match[2] === undefined) {
      errors.push({
        pointer: "/alternatives",
        message: `Alternative mal formée (« - **Nom** : raison » attendu) : « ${line.trim()} ».`,
      });
    } else value.push({ nom: match[1], raison: match[2] });
  }
  return { value, errors };
}

const REQUIRED = [
  { title: /^Contexte$/, label: "Contexte", pointer: "/contexte" },
  { title: /^D[ée]cision$/, label: "Décision", pointer: "/decision" },
  { title: /^Cons[ée]quences$/, label: "Conséquences", pointer: "/consequences" },
] as const;

function missingSections(body: Lines): Failure[] {
  return REQUIRED.filter(({ title }) => sectionLines(body, title) === undefined).map(
    ({ label, pointer }) => ({ pointer, message: `Section « ## ${label} » absente.` }),
  );
}

/** Décision d'architecture Markdown (front matter YAML puis cinq sections). Ne lève jamais. */
export function parseAdrMarkdown(path: string, content: string): EntityParse<Adr> {
  const big = tooLarge(path, content);
  if (big) return { ok: false, issues: [big] };
  const parts = splitFrontMatter(content);
  if (!parts) {
    const message = "Front matter YAML absent ou non terminé (lignes `---` attendues).";
    return { ok: false, issues: [structIssue("STRUCT_FRONT_MATTER_MISSING", path, message)] };
  }
  const front = loadYaml(path, parts.front);
  if (!front.ok) return front;
  const id = rawId(front.data);
  const consequences = parseConsequences(sectionLines(parts.body, /^Cons[ée]quences$/) ?? []);
  const alternatives = parseAlternatives(sectionLines(parts.body, /^Alternatives$/));
  const failures = [...missingSections(parts.body), ...consequences.errors, ...alternatives.errors];
  if (failures.length > 0) {
    const issues: Issue[] = failures.map((f) =>
      structIssue("STRUCT_MARKDOWN_SYNTAX", path, f.message, f.pointer, id),
    );
    return { ok: false, issues };
  }
  const plain = text(sectionLines(parts.body, /^En clair$/));
  const data = {
    ...(front.data as object),
    contexte: text(sectionLines(parts.body, /^Contexte$/)),
    decision: text(sectionLines(parts.body, /^D[ée]cision$/)),
    consequences: consequences.value,
    alternatives: alternatives.value,
    ...(plain === "" ? {} : { en_clair: plain }),
  };
  return parseWithSchema(AdrSchema, path, data, id);
}

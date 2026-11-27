import {
  type SecuritySummary,
  SecuritySummarySchema,
  SUMMARY_SECTIONS,
} from "../entities/index.ts";
import { structIssue } from "../issue.ts";
import { tooLarge } from "./yaml.ts";
import { type EntityParse, parseWithSchema } from "./zod-issues.ts";

const HEADING = /^##\s+(.*?)\s*$/;

type Sections = { bodies: Map<string, string[]>; problems: string[] };

/** Ouvre la section d'un titre `## …` : un titre inconnu ou répété est signalé et son corps écarté. */
function openSection(title: string, { bodies, problems }: Sections): string[] {
  const key = SUMMARY_SECTIONS.find((section) => section.title === title)?.key;
  const body: string[] = [];
  if (key === undefined) problems.push(`Section inconnue « ## ${title} ».`);
  else if (bodies.has(key)) problems.push(`Section répétée « ## ${title} ».`);
  else bodies.set(key, body);
  return body;
}

function readSections(content: string): Sections {
  const sections: Sections = { bodies: new Map(), problems: [] };
  let body: string[] | undefined;
  for (const line of content.replace(/^\ufeff/, "").split(/\r?\n/)) {
    const title = HEADING.exec(line)?.[1];
    if (title !== undefined) body = openSection(title, sections);
    else if (body !== undefined) body.push(line);
    else if (line.trim() !== "") {
      sections.problems.push("Texte avant la première section du résumé.");
    }
  }
  for (const { key, title } of SUMMARY_SECTIONS) {
    if (!sections.bodies.has(key)) sections.problems.push(`Section « ## ${title} » absente.`);
  }
  return sections;
}

/** Résumé client `security/summary.md` : les sept sections aux titres fixes. Ne lève jamais. */
export function parseSummaryMarkdown(path: string, content: string): EntityParse<SecuritySummary> {
  const big = tooLarge(path, content);
  if (big) return { ok: false, issues: [big] };
  const { bodies, problems } = readSections(content);
  if (problems.length > 0) {
    const issues = problems.map((message) => structIssue("STRUCT_MARKDOWN_SYNTAX", path, message));
    return { ok: false, issues };
  }
  const data = Object.fromEntries([...bodies].map(([key, body]) => [key, body.join("\n").trim()]));
  return parseWithSchema(SecuritySummarySchema, path, data);
}

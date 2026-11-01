import type { BusinessRule } from "../entities/index.ts";
import { BusinessRuleSchema } from "../entities/index.ts";
import { structIssue } from "../issue.ts";
import { splitFrontMatter } from "./frontmatter.ts";
import { sectionLines } from "./markdown-sections.ts";
import { loadYaml, tooLarge } from "./yaml.ts";
import { type EntityParse, parseWithSchema, rawId } from "./zod-issues.ts";

const BULLET = /^[-*]\s+(.+?)\s*$/;

type Lines = readonly string[];
type Examples = { value: string[]; errors: string[] };

/** Un exemple par puce ; toute autre ligne non vide est une erreur. */
function parseExamples(lines: Lines | undefined): Examples {
  const out: Examples = { value: [], errors: [] };
  for (const line of (lines ?? []).filter((l) => l.trim() !== "")) {
    const text = BULLET.exec(line)?.[1];
    if (text === undefined) out.errors.push(`Ligne d'exemple sans puce : « ${line.trim()} ».`);
    else out.value.push(text);
  }
  return out;
}

/** Règle métier Markdown (front matter YAML + `## Énoncé` + `## Exemples`). Ne lève jamais. */
export function parseRuleMarkdown(path: string, content: string): EntityParse<BusinessRule> {
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
  const statement = sectionLines(parts.body, /^[ÉE]nonc[ée]$/);
  const examples = parseExamples(sectionLines(parts.body, /^Exemples$/));
  const issues = [
    ...(statement === undefined
      ? [
          structIssue(
            "STRUCT_MARKDOWN_SYNTAX",
            path,
            "Section « ## Énoncé » absente.",
            "/enonce",
            id,
          ),
        ]
      : []),
    ...examples.errors.map((m) => structIssue("STRUCT_MARKDOWN_SYNTAX", path, m, "/exemples", id)),
  ];
  if (issues.length > 0) return { ok: false, issues };
  const data = {
    ...(front.data as object),
    enonce: (statement ?? []).join("\n").trim(),
    exemples: examples.value,
  };
  return parseWithSchema(BusinessRuleSchema, path, data, id);
}

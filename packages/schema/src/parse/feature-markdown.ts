import type { Feature } from "../entities/index.ts";
import { FeatureSchema } from "../entities/index.ts";
import { structIssue } from "../issue.ts";
import type { Issue } from "../types.ts";
import { splitFrontMatter } from "./frontmatter.ts";
import { parseCriteria, sectionLines } from "./markdown-sections.ts";
import { loadYaml, tooLarge } from "./yaml.ts";
import { type EntityParse, parseWithSchema, rawId } from "./zod-issues.ts";

function bodyIssues(path: string, id: string | undefined, body: readonly string[]) {
  const description = sectionLines(body, /^Description$/);
  const criteriaLines = sectionLines(body, /^Crit[èe]res d['’]acceptation$/);
  const issues: Issue[] = [];
  const add = (pointer: string, message: string) =>
    issues.push(structIssue("STRUCT_MARKDOWN_SYNTAX", path, message, pointer, id));
  if (description === undefined) add("/description", "Section « ## Description » absente.");
  if (criteriaLines === undefined)
    add("/criteres", "Section « ## Critères d'acceptation » absente.");
  const criteria = parseCriteria(criteriaLines ?? []);
  for (const error of criteria.errors) add(error.pointer, error.message);
  return {
    issues,
    description: (description ?? []).join("\n").trim(),
    criteres: criteria.value,
  };
}

/** Feature Markdown (front matter YAML + `## Description` + critères AC-n). Jamais d'exception. */
export function parseFeatureMarkdown(path: string, content: string): EntityParse<Feature> {
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
  const body = bodyIssues(path, id, parts.body);
  if (body.issues.length > 0) return { ok: false, issues: body.issues };
  const data = {
    ...(front.data as object),
    description: body.description,
    criteres: body.criteres,
  };
  return parseWithSchema(FeatureSchema, path, data, id);
}

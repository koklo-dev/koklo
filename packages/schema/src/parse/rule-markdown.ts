import type { BusinessRule } from "../entities/index.ts";
import type { EntityParse } from "./zod-issues.ts";

/** SQUELETTE (TK-53b, étape Red) : le Green le remplace (décisions 03-decisions-53b.md). */
export function parseRuleMarkdown(_path: string, _content: string): EntityParse<BusinessRule> {
  throw new Error("parseRuleMarkdown : non implémenté");
}

import {
  type SecuritySummary,
  SecuritySummarySchema,
  SUMMARY_SECTIONS,
} from "../entities/index.ts";
import { toPointer } from "../parse/zod-issues.ts";
import { EmitSecurityError } from "./security-error.ts";

/** Résumé client -> Markdown canonique (`security/summary.md`). `parseSummaryMarkdown(emit(s))` rend `s`. */
export function emitSummaryMarkdown(summary: SecuritySummary): string {
  const checked = SecuritySummarySchema.safeParse(summary);
  if (!checked.success) {
    const issue = checked.error.issues[0];
    throw new EmitSecurityError(
      issue?.message ?? EmitSecurityError.fallback,
      toPointer(issue?.path ?? []),
    );
  }
  return SUMMARY_SECTIONS.map(({ key, title }) => `## ${title}\n\n${checked.data[key]}\n`).join(
    "\n",
  );
}

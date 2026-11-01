export type FrontMatterParts = { front: string; body: string[] };

/** Sépare le front matter (entre deux lignes `---`) du corps. Ne lève jamais. */
export function splitFrontMatter(content: string): FrontMatterParts | undefined {
  const lines = content.replace(/^﻿/, "").split(/\r?\n/);
  if (lines[0]?.trimEnd() !== "---") return undefined;
  const end = lines.findIndex((line, i) => i > 0 && line.trimEnd() === "---");
  if (end < 0) return undefined;
  return { front: lines.slice(1, end).join("\n"), body: lines.slice(end + 1) };
}

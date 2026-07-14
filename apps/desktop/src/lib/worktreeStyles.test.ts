import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const worktreeCss = readFileSync(
  resolve(here, "../../../../packages/ui/src/components/molecules/WorktreeSwitcher/WorktreeSwitcher.css"),
  "utf8",
);

describe("WorktreeSwitcher styles", () => {
  it("keeps long worktree lists scrollable", () => {
    expect(worktreeCss).toMatch(/\.kk-worktree-list\s*\{[\s\S]*max-height:\s*[^;]+;/);
    expect(worktreeCss).toMatch(/\.kk-worktree-list\s*\{[\s\S]*overflow-y:\s*auto;/);
  });
});

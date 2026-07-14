import { describe, expect, it } from "vitest";
import type { SessionDto, WorktreeDto } from "@koklo/trpc-client";
import { canPruneWorktree, toWorktreeItems } from "./worktreesModel";

const session: SessionDto = {
  id: "s1",
  title: "Desktop worktree",
  status: "completed",
  preset: "light",
  projectPath: "/repo",
  workspacePath: "/repo/.koklo/worktrees/s1",
  workspaceBranch: "koklo/session/s1",
  createdAt: "2026-07-14T08:00:00Z",
  updatedAt: "2026-07-14T08:05:00Z",
};

const worktree: WorktreeDto = {
  sessionId: "s1",
  path: "/repo/.koklo/worktrees/s1",
  branch: "koklo/session/s1",
  isActive: true,
  status: "completed",
};

describe("worktreesModel", () => {
  it("maps a worktree dto to a switcher item with the session title", () => {
    const [item] = toWorktreeItems([worktree], [session]);
    expect(item.title).toBe("Desktop worktree");
    expect(item.id).toBe(worktree.path);
    expect(item.canPrune).toBe(true);
  });

  it("prevents pruning running worktrees", () => {
    expect(canPruneWorktree({ ...worktree, status: "running" })).toBe(false);
  });

  it("rejects pruning non-koklo paths", () => {
    expect(canPruneWorktree({ ...worktree, path: "/repo" })).toBe(false);
  });
});

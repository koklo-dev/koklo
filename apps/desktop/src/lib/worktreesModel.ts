import type { KokloClient, SessionDto, WorktreeDto } from "@koklo/trpc-client";
import type { WorktreeSwitcherItem } from "@koklo/ui";

export type WorktreesClient = Pick<KokloClient, "worktrees">;

export interface WorktreeViewItem extends WorktreeSwitcherItem {
  sessionId: string;
}

export function canPruneWorktree(worktree: WorktreeDto): boolean {
  const status = worktree.status.toLowerCase();
  if (["running", "queued", "pending", "in_progress"].includes(status)) return false;
  return worktree.path.includes("/.koklo/worktrees/") || worktree.path.includes("\\.koklo\\worktrees\\");
}

export function toWorktreeItems(
  worktrees: readonly WorktreeDto[],
  sessions: readonly SessionDto[],
): WorktreeViewItem[] {
  const bySession = new Map(sessions.map((session) => [session.id, session]));
  return worktrees.map((worktree) => {
    const session = bySession.get(worktree.sessionId);
    return {
      id: worktree.path,
      sessionId: worktree.sessionId,
      title: session?.title ?? worktree.branch,
      branch: worktree.branch,
      path: worktree.path,
      status: worktree.status,
      isActive: worktree.isActive,
      canPrune: canPruneWorktree(worktree),
    };
  });
}

export async function loadWorktreeItems(
  client: WorktreesClient,
  sessions: readonly SessionDto[],
): Promise<WorktreeViewItem[]> {
  const worktrees = await client.worktrees.list();
  return toWorktreeItems(worktrees, sessions);
}

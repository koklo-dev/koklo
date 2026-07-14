import { describe, it, expect, vi } from "vitest";
import type { SessionDto } from "@koklo/trpc-client";
import {
  toSessionStatus,
  toPreset,
  formatTimestamp,
  toCardProps,
  submitRun,
  isAbsolutePath,
  loadLastProjectPath,
  saveLastProjectPath,
  type SessionsClient,
} from "./sessionsModel";

const baseDto: SessionDto = {
  id: "s1",
  title: "Add passwordless login",
  status: "running",
  preset: "bmad",
  projectPath: "/home/me/proj",
  workspacePath: "/home/me/proj/.koklo/worktrees/s1",
  workspaceBranch: "koklo/session/abc123",
  createdAt: "2026-06-14T07:48:00Z",
  updatedAt: "2026-06-14T09:12:00Z",
};

describe("toSessionStatus", () => {
  it("maps backend synonyms to DS statuses", () => {
    expect(toSessionStatus("running")).toBe("running");
    expect(toSessionStatus("in_progress")).toBe("running");
    expect(toSessionStatus("pending")).toBe("queued");
    expect(toSessionStatus("completed")).toBe("done");
    expect(toSessionStatus("error")).toBe("failed");
    expect(toSessionStatus("canceled")).toBe("cancelled");
  });
  it("falls back to queued for unknown values", () => {
    expect(toSessionStatus("weird")).toBe("queued");
  });
});

describe("toPreset", () => {
  it("passes through known presets and falls back to light", () => {
    expect(toPreset("sdd")).toBe("sdd");
    expect(toPreset("nonsense")).toBe("light");
  });
});

describe("formatTimestamp", () => {
  it("formats ISO to DD Mon HH:mm in UTC", () => {
    expect(formatTimestamp("2026-06-14T09:12:00Z")).toBe("14 Jun 09:12");
  });
  it("returns the input unchanged when unparseable", () => {
    expect(formatTimestamp("not-a-date")).toBe("not-a-date");
  });
});

describe("toCardProps", () => {
  it("surfaces the worktree path when it differs from the project root", () => {
    const card = toCardProps(baseDto);
    expect(card.worktreePath).toBe("/home/me/proj/.koklo/worktrees/s1");
    expect(card.status).toBe("running");
    expect(card.preset).toBe("bmad");
    expect(card.updatedAt).toBe("14 Jun 09:12");
  });
  it("omits the worktree path when it equals the project root, keeping the branch", () => {
    const card = toCardProps({ ...baseDto, workspacePath: baseDto.projectPath });
    expect(card.worktreePath).toBeUndefined();
    expect(card.branch).toBe("koklo/session/abc123");
  });
});

describe("submitRun", () => {
  it("calls sessions.run with the trimmed, mapped input", async () => {
    const run = vi.fn(async () => baseDto);
    const client = { sessions: { run } } as unknown as SessionsClient;
    const result = await submitRun(client, {
      type: "feature",
      title: "  Add OAuth login  ",
      preset: "light",
      projectPath: "/home/me/proj",
    });
    expect(run).toHaveBeenCalledWith({
      type: "feature",
      title: "Add OAuth login",
      preset: "light",
      projectPath: "/home/me/proj",
    });
    expect(result).toBe(baseDto);
  });
  it("rejects an empty title without calling the backend", async () => {
    const run = vi.fn(async () => baseDto);
    const client = { sessions: { run } } as unknown as SessionsClient;
    await expect(
      submitRun(client, { type: "task", title: "   ", preset: "light", projectPath: "/p" }),
    ).rejects.toThrow(/title is required/i);
    expect(run).not.toHaveBeenCalled();
  });
  // A relative projectPath resolves against the Tauri process cwd (src-tauri in
  // dev), where the pipeline's artifact writes restart the dev watcher. The form
  // must refuse anything non-absolute before it reaches the backend.
  it("rejects a relative projectPath without calling the backend", async () => {
    const run = vi.fn(async () => baseDto);
    const client = { sessions: { run } } as unknown as SessionsClient;
    await expect(
      submitRun(client, { type: "feature", title: "Fix login", preset: "light", projectPath: "." }),
    ).rejects.toThrow(/absolute/i);
    await expect(
      submitRun(client, {
        type: "feature",
        title: "Fix login",
        preset: "light",
        projectPath: "sub/dir",
      }),
    ).rejects.toThrow(/absolute/i);
    expect(run).not.toHaveBeenCalled();
  });
  it("rejects an empty projectPath without calling the backend", async () => {
    const run = vi.fn(async () => baseDto);
    const client = { sessions: { run } } as unknown as SessionsClient;
    await expect(
      submitRun(client, { type: "feature", title: "Fix login", preset: "light", projectPath: "  " }),
    ).rejects.toThrow(/project path/i);
    expect(run).not.toHaveBeenCalled();
  });
  it("trims the projectPath it sends to the backend", async () => {
    const run = vi.fn(async () => baseDto);
    const client = { sessions: { run } } as unknown as SessionsClient;
    await submitRun(client, {
      type: "feature",
      title: "Fix login",
      preset: "light",
      projectPath: " /home/me/proj ",
    });
    expect(run).toHaveBeenCalledWith(expect.objectContaining({ projectPath: "/home/me/proj" }));
  });
});

describe("isAbsolutePath", () => {
  it("accepts POSIX and Windows absolute paths", () => {
    expect(isAbsolutePath("/home/me/proj")).toBe(true);
    expect(isAbsolutePath("C:\\work\\proj")).toBe(true);
    expect(isAbsolutePath("C:/work/proj")).toBe(true);
  });
  it("refuses relative, empty, and home-shorthand paths", () => {
    expect(isAbsolutePath(".")).toBe(false);
    expect(isAbsolutePath("sub/dir")).toBe(false);
    expect(isAbsolutePath("")).toBe(false);
    expect(isAbsolutePath("~/proj")).toBe(false);
  });
});

describe("last project path persistence", () => {
  const memoryStorage = () => {
    const data = new Map<string, string>();
    return {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
    };
  };
  it("round-trips the last used project path", () => {
    const storage = memoryStorage();
    saveLastProjectPath(storage, "/home/me/proj");
    expect(loadLastProjectPath(storage)).toBe("/home/me/proj");
  });
  it("returns an empty string when nothing was saved", () => {
    expect(loadLastProjectPath(memoryStorage())).toBe("");
  });
});

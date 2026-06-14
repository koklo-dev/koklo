import { describe, it, expect, vi } from "vitest";
import type { SessionDto } from "@koklo/trpc-client";
import {
  toSessionStatus,
  toPreset,
  formatTimestamp,
  toCardProps,
  submitRun,
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
    const result = await submitRun(
      client,
      { type: "feature", title: "  Add OAuth login  ", preset: "light" },
      "/home/me/proj",
    );
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
      submitRun(client, { type: "task", title: "   ", preset: "light" }, "/p"),
    ).rejects.toThrow(/title is required/i);
    expect(run).not.toHaveBeenCalled();
  });
});

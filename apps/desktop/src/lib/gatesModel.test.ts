import { describe, expect, it } from "vitest";
import type { GateDto, SessionDto } from "@koklo/trpc-client";
import {
  flattenPendingGates,
  pendingGateCount,
  type PendingGateItem,
} from "./gatesModel";

const sessions: SessionDto[] = [
  {
    id: "s1",
    title: "Ship gate center",
    status: "running",
    preset: "sdd",
    projectPath: "/repo",
    workspacePath: "/repo/.koklo/worktrees/s1",
    workspaceBranch: "koklo/session/s1",
    createdAt: "2026-07-14T09:00:00Z",
    updatedAt: "2026-07-14T09:05:00Z",
  },
  {
    id: "s2",
    title: "Fix approval modal",
    status: "running",
    preset: "light",
    projectPath: "/repo",
    workspacePath: "/repo",
    workspaceBranch: "koklo/session/s2",
    createdAt: "2026-07-14T09:10:00Z",
    updatedAt: "2026-07-14T09:15:00Z",
  },
];

function gate(overrides: Partial<GateDto> = {}): GateDto {
  return {
    sessionId: "s1",
    phase: "implement",
    kind: "command_execution",
    description: "Approve the implement phase output.",
    requestId: "req-1",
    details: null,
    ...overrides,
  };
}

describe("flattenPendingGates", () => {
  it("keeps the parent session context and preserves session ordering", () => {
    const items = flattenPendingGates(sessions, {
      s2: [gate({ sessionId: "s2", requestId: "req-2" })],
      s1: [gate({ sessionId: "s1", requestId: "req-1" })],
    });

    expect(items.map((item) => item.session.id)).toEqual(["s1", "s2"]);
    expect(items.map((item) => item.gate.requestId)).toEqual(["req-1", "req-2"]);
  });

  it("drops sessions without unresolved gates", () => {
    const items = flattenPendingGates(sessions, { s1: [gate()] });
    expect(items).toHaveLength(1);
    expect(items[0]?.session.id).toBe("s1");
  });
});

describe("pendingGateCount", () => {
  it("counts every unresolved gate across sessions", () => {
    const items: PendingGateItem[] = flattenPendingGates(sessions, {
      s1: [gate({ requestId: "req-1" }), gate({ requestId: "req-2" })],
      s2: [gate({ sessionId: "s2", requestId: "req-3" })],
    });
    expect(pendingGateCount(items)).toBe(3);
  });
});

import { describe, it, expect, vi } from "vitest";
import type { TranscriptKind, TranscriptLineDto } from "@koklo/trpc-client";
import {
  renderTypeOf,
  messageRole,
  isStreaming,
  lineText,
  toCodeLines,
  maxSeq,
  mergeLine,
  latestPhase,
  latestUsage,
  isNearBottom,
  loadAndSubscribe,
  type TranscriptClient,
} from "./transcriptModel";

function line(over: Partial<TranscriptLineDto> & { seq: number }): TranscriptLineDto {
  return {
    id: `l${over.seq}`,
    sessionId: "s1",
    phase: null,
    agentName: null,
    source: "llm",
    kind: "message",
    status: "completed",
    itemKey: null,
    summary: "",
    payload: null,
    createdAt: "2026-06-14T09:00:00Z",
    ...over,
  };
}

describe("renderTypeOf", () => {
  it("maps each kind to its render bucket (AC#1)", () => {
    const cases: [TranscriptKind, string][] = [
      ["message", "llm"],
      ["reasoning", "llm"],
      ["command", "shell"],
      ["tool_result", "output"],
      ["file_change", "output"],
      ["approval_request", "gate"],
      ["usage", "meta"],
      ["phase_lifecycle", "meta"],
    ];
    for (const [kind, expected] of cases) {
      expect(renderTypeOf(line({ seq: 1, kind }))).toBe(expected);
    }
  });
});

describe("messageRole", () => {
  it("treats user source / user_input_response as a user bubble", () => {
    expect(messageRole(line({ seq: 1, source: "user" }))).toBe("user");
    expect(messageRole(line({ seq: 1, kind: "user_input_response" }))).toBe("user");
    expect(messageRole(line({ seq: 1, source: "llm" }))).toBe("assistant");
  });
});

describe("isStreaming", () => {
  it("is true only for an open message_delta", () => {
    expect(isStreaming(line({ seq: 1, kind: "message_delta", status: "streaming" }))).toBe(true);
    expect(isStreaming(line({ seq: 1, kind: "message_delta", status: "completed" }))).toBe(false);
    expect(isStreaming(line({ seq: 1, kind: "message", status: "streaming" }))).toBe(false);
  });
});

describe("lineText", () => {
  it("reads a string payload, then known text fields, then falls back to summary", () => {
    expect(lineText(line({ seq: 1, payload: "raw" }))).toBe("raw");
    expect(lineText(line({ seq: 1, payload: { output: "ok" } }))).toBe("ok");
    expect(lineText(line({ seq: 1, payload: null, summary: "sum" }))).toBe("sum");
  });
});

describe("toCodeLines", () => {
  it("splits text into rows and drops a single trailing newline", () => {
    expect(toCodeLines(line({ seq: 1, payload: "a\nb\n" }))).toEqual([{ content: "a" }, { content: "b" }]);
  });
  it("keeps interior blank lines", () => {
    expect(toCodeLines(line({ seq: 1, payload: "a\n\nb" }))).toHaveLength(3);
  });
});

describe("maxSeq", () => {
  it("returns the largest seq, 0 for empty", () => {
    expect(maxSeq([])).toBe(0);
    expect(maxSeq([line({ seq: 3 }), line({ seq: 7 }), line({ seq: 5 })])).toBe(7);
  });
});

describe("mergeLine", () => {
  it("appends a newer persisted line and keeps seq order", () => {
    const base = [line({ seq: 1 }), line({ seq: 2 })];
    expect(mergeLine(base, line({ seq: 3 })).map((l) => l.seq)).toEqual([1, 2, 3]);
  });
  it("inserts an out-of-order persisted line at the right position", () => {
    const base = [line({ seq: 1 }), line({ seq: 3 })];
    expect(mergeLine(base, line({ seq: 2 })).map((l) => l.seq)).toEqual([1, 2, 3]);
  });
  it("appends live seq-0 sentinel lines at the tail, in arrival order", () => {
    const base = [line({ seq: 1 }), line({ seq: 2 })];
    const after1 = mergeLine(base, line({ id: "live-a", seq: 0 }));
    const after2 = mergeLine(after1, line({ id: "live-b", seq: 0 }));
    expect(after2.map((l) => l.id)).toEqual(["l1", "l2", "live-a", "live-b"]);
  });
  it("is idempotent on a duplicate id (no double-paint on replay overlap, AC#2)", () => {
    const base = [line({ id: "x", seq: 1 }), line({ id: "y", seq: 2 })];
    // Same id re-arrives later with its authoritative seq + finalized payload.
    const merged = mergeLine(base, line({ id: "y", seq: 9, summary: "updated" }));
    expect(merged).toHaveLength(2);
    expect(merged[1].summary).toBe("updated");
  });
});

describe("latestPhase", () => {
  it("returns the most recent non-null phase", () => {
    expect(latestPhase([line({ seq: 1, phase: "plan" }), line({ seq: 2, phase: "implement" }), line({ seq: 3 })])).toBe(
      "implement",
    );
    expect(latestPhase([line({ seq: 1 })])).toBeNull();
  });
});

describe("latestUsage", () => {
  it("rolls up the most recent usage line", () => {
    const lines = [
      line({ seq: 1, kind: "usage", payload: { promptTokens: 10, completionTokens: 5, costUsd: 0.01 } }),
      line({ seq: 2, kind: "usage", payload: { promptTokens: 20, completionTokens: 8, costUsd: 0.02 } }),
    ];
    expect(latestUsage(lines)).toEqual({ promptTokens: 20, completionTokens: 8, costUsd: 0.02 });
  });
  it("returns null when no usage line exists", () => {
    expect(latestUsage([line({ seq: 1 })])).toBeNull();
  });
});

describe("isNearBottom", () => {
  it("detects pinned-to-bottom within the threshold", () => {
    expect(isNearBottom({ scrollTop: 460, scrollHeight: 1000, clientHeight: 520 })).toBe(true);
    expect(isNearBottom({ scrollTop: 100, scrollHeight: 1000, clientHeight: 520 })).toBe(false);
  });
});

describe("loadAndSubscribe", () => {
  it("loads history BEFORE subscribing to live events (AC#2 ordering)", async () => {
    const calls: string[] = [];
    const history = [line({ seq: 1 }), line({ seq: 2 })];
    const client = {
      transcript: {
        list: vi.fn(async () => {
          calls.push("list");
          return history;
        }),
        subscribe: vi.fn(async () => {
          calls.push("subscribe");
          return () => calls.push("unlisten");
        }),
      },
    } as unknown as TranscriptClient;

    const { history: got, unlisten } = await loadAndSubscribe(client, "s1", () => {});
    expect(calls).toEqual(["list", "subscribe"]);
    expect(got).toBe(history);
    unlisten();
    expect(calls).toEqual(["list", "subscribe", "unlisten"]);
  });
});

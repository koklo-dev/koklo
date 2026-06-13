import { describe, expect, it, vi } from "vitest";
import { createKokloClient, type InvokeFn, type ListenFn } from "./client.js";
import { contract, type SessionDto, type TranscriptLineDto } from "./contract.js";

function sessionDto(id: string): SessionDto {
  return {
    id,
    title: "Auth retry policy",
    status: "running",
    preset: "sdd",
    projectPath: "/repo",
    workspacePath: `/repo/.koklo/worktrees/${id}`,
    workspaceBranch: `koklo/session/${id}`,
    createdAt: "2026-06-14T00:00:00Z",
    updatedAt: "2026-06-14T00:01:00Z",
  };
}

function line(sessionId: string, seq: number): TranscriptLineDto {
  return {
    id: `item-${seq}`,
    sessionId,
    seq,
    phase: "developer",
    agentName: "developer",
    source: "provider",
    kind: "message",
    status: "completed",
    itemKey: null,
    summary: "hello",
    payload: null,
    createdAt: "2026-06-14T00:00:00Z",
  };
}

describe("createKokloClient — invoke adapter", () => {
  it("routes a no-arg query to its contract command name", async () => {
    const invokeFn = vi.fn<InvokeFn>().mockResolvedValue([sessionDto("s1")]);
    const client = createKokloClient({ invokeFn });

    const sessions = await client.sessions.list();

    expect(invokeFn).toHaveBeenCalledWith(contract.sessions.list.command, undefined);
    expect(invokeFn).toHaveBeenCalledTimes(1);
    expect(sessions[0]?.workspaceBranch).toBe("koklo/session/s1");
  });

  it("forwards the typed input to invoke for a parameterised query", async () => {
    const rows = [line("s1", 2), line("s1", 3)];
    const invokeFn = vi.fn<InvokeFn>().mockResolvedValue(rows);
    const client = createKokloClient({ invokeFn });

    const result = await client.transcript.since({ sessionId: "s1", sinceSeq: 1 });

    expect(invokeFn).toHaveBeenCalledWith(contract.transcript.since.command, {
      sessionId: "s1",
      sinceSeq: 1,
    });
    expect(result.map((l) => l.seq)).toEqual([2, 3]);
  });

  it("propagates invoke rejections to the caller", async () => {
    const invokeFn = vi.fn<InvokeFn>().mockRejectedValue(new Error("ipc down"));
    const client = createKokloClient({ invokeFn });

    await expect(client.gates.decide({ sessionId: "s1", action: "approve" })).rejects.toThrow(
      "ipc down",
    );
  });
});

describe("createKokloClient — transcript event subscription", () => {
  it("listens on the contract event and delivers only the session's lines", async () => {
    let emit: (e: { payload: TranscriptLineDto }) => void = () => {};
    const unlisten = vi.fn();
    const listenFn = vi.fn<ListenFn>().mockImplementation(async (_event, handler) => {
      emit = handler as typeof emit;
      return unlisten;
    });
    const client = createKokloClient({ listenFn });

    const received: TranscriptLineDto[] = [];
    const off = await client.transcript.subscribe({ sessionId: "s1" }, (l) => received.push(l));

    expect(listenFn).toHaveBeenCalledWith(contract.transcript.subscribe.event, expect.any(Function));

    emit({ payload: line("s1", 1) });
    emit({ payload: line("s2", 2) }); // different session — filtered out
    emit({ payload: line("s1", 3) });

    expect(received.map((l) => l.seq)).toEqual([1, 3]);
    expect(off).toBe(unlisten);
  });
});

describe("createKokloClient — defaults to @tauri-apps/api", () => {
  it("uses the real invoke transport when none is injected", async () => {
    vi.resetModules();
    const invoke = vi.fn().mockResolvedValue([]);
    vi.doMock("@tauri-apps/api/core", () => ({ invoke }));
    vi.doMock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));

    const { createKokloClient: freshCreate } = await import("./client.js");
    const { contract: freshContract } = await import("./contract.js");
    await freshCreate().providers.list();

    expect(invoke).toHaveBeenCalledWith(freshContract.providers.list.command, undefined);
    vi.doUnmock("@tauri-apps/api/core");
    vi.doUnmock("@tauri-apps/api/event");
  });
});

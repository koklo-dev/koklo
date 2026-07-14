import { describe, expect, it, vi } from "vitest";
import { BROWSER_CLIENT_STATE_KEY, createBrowserClient, hasTauriRuntime } from "./browserClient";

function storage(initial?: string): Storage {
  const data = new Map<string, string>();
  if (initial) data.set(BROWSER_CLIENT_STATE_KEY, initial);

  return {
    length: data.size,
    clear() {
      data.clear();
    },
    getItem(key) {
      return data.get(key) ?? null;
    },
    key(index) {
      return Array.from(data.keys())[index] ?? null;
    },
    removeItem(key) {
      data.delete(key);
    },
    setItem(key, value) {
      data.set(key, value);
    },
  } as Storage;
}

describe("browser desktop client", () => {
  it("exposes seeded browser sessions and transcript history", async () => {
    const client = createBrowserClient(storage());

    const sessions = await client.sessions.list();
    const transcript = await client.transcript.list({ sessionId: "session-browser-1" });

    expect(sessions[0]?.title).toBe("Desktop shell smoke coverage");
    expect(transcript[0]?.summary).toBe("Session started");
  });

  it("persists a new session run in browser storage", async () => {
    const store = storage();
    const client = createBrowserClient(store);

    const session = await client.sessions.run({
      type: "feature",
      title: "  New desktop flow  ",
      preset: "light",
      projectPath: "/tmp/koklo",
    });
    const sessions = await client.sessions.list();

    expect(session.workspaceBranch).toContain("koklo/session/");
    expect(sessions[0]?.title).toBe("  New desktop flow  ");
    expect(store.getItem(BROWSER_CLIENT_STATE_KEY)).toContain("/tmp/koklo/.koklo/worktrees/");
  });
});

describe("hasTauriRuntime", () => {
  it("detects the browser path when Tauri internals are absent", () => {
    const previous = (globalThis as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
    delete (globalThis as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;

    expect(hasTauriRuntime()).toBe(false);

    if (previous !== undefined) {
      (globalThis as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = previous;
    }
  });

  it("detects an active Tauri runtime", () => {
    const host = globalThis as { __TAURI_INTERNALS__?: unknown };
    const previous = host.__TAURI_INTERNALS__;
    host.__TAURI_INTERNALS__ = { invoke: vi.fn() };

    expect(hasTauriRuntime()).toBe(true);

    host.__TAURI_INTERNALS__ = previous;
  });
});

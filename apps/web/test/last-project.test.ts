import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { lastProjectPath } from "../src/lib/last-project.ts";

/** TK-88 (C3) : `/` et `/kanban` résolvent le dernier projet ouvert côté serveur (`project.recent`). */
const ID = "7d1f6c1e-0b0a-4c55-9d63-1d2f7d6a1b01";
const fetchMock = vi.fn();

beforeEach(() => vi.stubGlobal("fetch", fetchMock));
afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

const recent = (body: unknown, status = 200) =>
  fetchMock.mockResolvedValue(new Response(JSON.stringify(body), { status }));

describe("lastProjectPath", () => {
  it("appelle GET /project-visits avec le cookie de la requête", async () => {
    recent([{ id: ID, name: "A", visitedAt: "2026-11-07T10:00:00.000Z" }]);
    await lastProjectPath("http://api.internal:3001", "sid=abc");
    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(String(url)).toBe("http://api.internal:3001/project-visits");
    expect(init.headers).toEqual({ cookie: "sid=abc" });
    expect(init.cache).toBe("no-store");
  });

  it("rend le plus récent (premier de la liste)", async () => {
    recent([
      { id: ID, name: "A", visitedAt: "2026-11-07T10:00:00.000Z" },
      {
        id: "7d1f6c1e-0b0a-4c55-9d63-1d2f7d6a1b02",
        name: "B",
        visitedAt: "2026-11-06T10:00:00.000Z",
      },
    ]);
    expect(await lastProjectPath("http://api.internal:3001", null)).toBe(`/projects/${ID}`);
  });

  it("ajoute le suffixe demandé (/kanban → tickets)", async () => {
    recent([{ id: ID, name: "A", visitedAt: "2026-11-07T10:00:00.000Z" }]);
    expect(await lastProjectPath("http://api.internal:3001", null, "/tickets")).toBe(
      `/projects/${ID}/tickets`,
    );
  });

  it("sans visite : /projects", async () => {
    recent([]);
    expect(await lastProjectPath("http://api.internal:3001", null, "/tickets")).toBe("/projects");
  });

  it.each([401, 404, 500])(
    "réponse %s : /projects (la garde arbitre la session)",
    async (status) => {
      recent({ code: "X" }, status);
      expect(await lastProjectPath("http://api.internal:3001", null)).toBe("/projects");
    },
  );

  it("corps invalide ou réseau en panne : /projects", async () => {
    recent({ nope: true });
    expect(await lastProjectPath("http://api.internal:3001", null)).toBe("/projects");
    fetchMock.mockRejectedValue(new Error("réseau"));
    expect(await lastProjectPath("http://api.internal:3001", null)).toBe("/projects");
  });

  it("un identifiant qui n'est pas un uuid n'est jamais mis dans l'adresse", async () => {
    recent([{ id: "../../etc", name: "A", visitedAt: "2026-11-07T10:00:00.000Z" }]);
    expect(await lastProjectPath("http://api.internal:3001", null)).toBe("/projects");
  });
});

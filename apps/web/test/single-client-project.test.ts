import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { singleClientProjectPath } from "../src/lib/single-client-project.ts";
import { cardsPage, projectCard } from "./support/web-mocks.ts";

/** TK-93 (B305) : un client qui n'a qu'un projet est redirigé côté serveur vers ce projet. */
const fetchMock = vi.fn();
beforeEach(() => vi.stubGlobal("fetch", fetchMock));
afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

const reply = (body: unknown, status = 200) =>
  fetchMock.mockResolvedValue(new Response(JSON.stringify(body), { status }));
const ONE = projectCard({ id: "7d1f6c1e-0b0a-4c55-9d63-1d2f7d6a1b01" });

describe("singleClientProjectPath", () => {
  it("appelle GET /projects/cards avec le cookie de la requête", async () => {
    reply(cardsPage([ONE], { audience: "client" }));
    await singleClientProjectPath("http://api.internal:3001", "sid=abc");
    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(String(url)).toBe("http://api.internal:3001/projects/cards?limit=2");
    expect(init.headers).toEqual({ cookie: "sid=abc" });
    expect(init.cache).toBe("no-store");
  });

  it("client à un seul projet : le chemin du projet", async () => {
    reply(cardsPage([ONE], { audience: "client" }));
    expect(await singleClientProjectPath("http://api", null)).toBe(`/projects/${ONE.id}`);
  });

  it("client à plusieurs projets, ou équipe : pas de redirection", async () => {
    reply(
      cardsPage([ONE, projectCard({ id: "7d1f6c1e-0b0a-4c55-9d63-1d2f7d6a1b02" })], {
        audience: "client",
      }),
    );
    expect(await singleClientProjectPath("http://api", null)).toBeNull();
    reply(cardsPage([ONE]));
    expect(await singleClientProjectPath("http://api", null)).toBeNull();
  });

  it("erreur réseau, statut d'erreur ou corps inattendu : pas de redirection", async () => {
    fetchMock.mockRejectedValue(new Error("réseau"));
    expect(await singleClientProjectPath("http://api", null)).toBeNull();
    reply({}, 401);
    expect(await singleClientProjectPath("http://api", null)).toBeNull();
    reply({ nope: true });
    expect(await singleClientProjectPath("http://api", null)).toBeNull();
  });
});

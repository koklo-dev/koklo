import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ROLES } from "./helpers/organizations.ts";
import { installBench } from "./helpers/repo-scene.ts";
import {
  createSuggestionScene,
  type SuggestionScene,
  suggestionApi,
  suggestionRows,
} from "./helpers/suggestions.ts";
import { apiFor } from "./helpers/tickets.ts";

/**
 * TK-55c : matrice des rôles (CDC §14, analyse §3.3, D3 et D4). Création et retrait : owner, admin,
 * dev, designer, client lié (le business lit seulement). Décision : owner, admin, dev. Lecture : les
 * six rôles. Le garde de rôle précède le cloisonnement (un client qui décide reçoit 403, pas 404).
 */
const bench = installBench({ beforeAll, afterAll, beforeEach });
let scene: SuggestionScene;
beforeEach(async () => {
  scene = await createSuggestionScene(bench());
});

const actorOf = (role: (typeof ROLES)[number]) => scene.p1.world.actors[role];
const api = (role: (typeof ROLES)[number]) => suggestionApi(bench().app, actorOf(role));
const CREATORS = ["owner", "admin", "dev", "designer", "client"] as const;
const DENIED_CREATE = ["business"] as const;
const DECIDERS = ["owner", "admin", "dev"] as const;
const DENIED_DECIDE = ["designer", "client", "business"] as const;

async function openSuggestion(role: (typeof ROLES)[number] = "dev") {
  const res = await api(role).create(scene.p1.projectId, { body: `Idée de ${role}` });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body.id as string;
}

describe("suggestion.create", () => {
  it.each(CREATORS)("%s (lié si client) crée : 200 avec une clé SG-n", async (role) => {
    const res = await api(role).create(scene.p1.projectId);

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.key).toMatch(/^SG-[1-9][0-9]*$/);
  });

  it.each(DENIED_CREATE)("%s : 403 FORBIDDEN, aucune suggestion", async (role) => {
    const res = await api(role).create(scene.p1.projectId);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("FORBIDDEN");
    expect(await suggestionRows(bench().database, scene.p1.projectId)).toHaveLength(0);
  });

  it("client sans lien : 404 (le garde de rôle passe, le cloisonnement refuse)", async () => {
    const res = await suggestionApi(bench().app, scene.c3).create(scene.p1.projectId);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("NOT_FOUND");
  });

  it("sans session : 401 UNAUTHORIZED", async () => {
    const res = await suggestionApi(bench().app, undefined).create(scene.p1.projectId);

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("UNAUTHORIZED");
  });
});

describe("suggestion.list", () => {
  it.each(ROLES)(
    "%s lit les suggestions de p1 (client lié, équipe et business sans lien)",
    async (role) => {
      const res = await api(role).list(scene.p1.projectId);

      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body.items).toEqual([]);
    },
  );

  it("sans session : 401", async () => {
    expect((await suggestionApi(bench().app, undefined).list(scene.p1.projectId)).status).toBe(401);
  });
});

describe("suggestion.withdraw", () => {
  it.each(CREATORS)("%s retire sa propre suggestion : 200 withdrawn", async (role) => {
    const id = await openSuggestion(role);

    const res = await api(role).withdraw(scene.p1.projectId, id);

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.status).toBe("withdrawn");
  });

  it("business : 403 avant toute lecture de la suggestion", async () => {
    const id = await openSuggestion("dev");

    const res = await api("business").withdraw(scene.p1.projectId, id);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("FORBIDDEN");
  });
});

describe.each(["accept", "reject"] as const)("suggestion.%s", (action) => {
  it.each(DECIDERS)("%s décide la suggestion d'un client : 200", async (role) => {
    const id = await openSuggestion("client");

    const res = await api(role)[action](scene.p1.projectId, id);

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.status).toBe(action === "accept" ? "accepted" : "rejected");
  });

  it.each(DENIED_DECIDE)("%s : 403 FORBIDDEN, la suggestion reste ouverte", async (role) => {
    const id = await openSuggestion("client");

    const res = await api(role)[action](scene.p1.projectId, id);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("FORBIDDEN");
    const [row] = await suggestionRows(bench().database, scene.p1.projectId);
    expect(row?.status).toBe("open");
  });

  it("un client sans lien reçoit 403 (rôle refusé avant le cloisonnement), jamais 404", async () => {
    const id = await openSuggestion("client");

    const res = await suggestionApi(bench().app, scene.c3)[action](scene.p1.projectId, id);

    expect(res.status).toBe(403);
  });

  it("sans session : 401", async () => {
    const id = await openSuggestion("client");

    expect(
      (await suggestionApi(bench().app, undefined)[action](scene.p1.projectId, id)).status,
    ).toBe(401);
  });
});

describe("un client ne peut pas éditer : ses seules écritures sont suggérer, retirer et commenter", () => {
  it("ticket.create reste 403 pour le client lié, suggestion.create est 200", async () => {
    const client = scene.p1.world.actors.client;

    expect((await apiFor(bench().app, client, scene.p1.projectId).createTicket()).status).toBe(403);
    expect((await suggestionApi(bench().app, client).create(scene.p1.projectId)).status).toBe(200);
  });
});

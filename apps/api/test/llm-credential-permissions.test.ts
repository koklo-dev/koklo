import type { Role } from "@koklo/contract";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { auditRowsFull } from "./helpers/comments.ts";
import {
  credentialRows,
  llmApi,
  llmBench,
  PROVIDER,
  ROUTE,
  withBearer,
  worldOf,
} from "./helpers/llm-credential-routes.ts";
import { makeSentinel } from "./helpers/llm-credentials.ts";

/**
 * TK-52b : matrice de rôles (CDC §14, « Gérer org, membres, fournisseurs, clés BYOK » = owner et
 * admin) sur les six rôles et les quatre procédures, `list` compris. Le refus précède toute
 * lecture, validation ou recherche : même 403 quelle que soit l'entrée.
 */
const bench = llmBench({ beforeAll, afterAll, beforeEach });
const secret = makeSentinel();

const ALLOWED: Role[] = ["owner", "admin"];
const DENIED: Role[] = ["dev", "designer", "client", "business"];
type Api = ReturnType<typeof llmApi>;
type Procedure = "list" | "set" | "remove" | "invalidate";
const PROCEDURES: Procedure[] = ["list", "set", "remove", "invalidate"];

const invoke = (api: Api, procedure: Procedure) => {
  if (procedure === "list") return api.list();
  if (procedure === "set") return api.set(PROVIDER, { apiKey: secret });
  if (procedure === "remove") return api.remove(PROVIDER);
  return api.invalidate(PROVIDER);
};

/** Monde avec une clé déjà posée par l'owner (remove et invalidate ont une cible réelle). */
async function seeded() {
  const b = bench();
  const world = await worldOf(b);
  const put = await llmApi(b.app, world.actors.owner).set(PROVIDER, { apiKey: secret });
  expect(put.status, JSON.stringify(put.body)).toBe(200);
  return { b, world };
}

describe.each(PROCEDURES)("llmCredential.%s : rôles autorisés", (procedure) => {
  it.each(ALLOWED)("%s réussit", async (role) => {
    const { b, world } = await seeded();
    const res = await invoke(llmApi(b.app, world.actors[role]), procedure);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
  });
});

describe.each(PROCEDURES)("llmCredential.%s : rôles refusés", (procedure) => {
  it.each(DENIED)("%s reçoit 403 FORBIDDEN, sans aucun effet", async (role) => {
    const { b, world } = await seeded();
    const rowsBefore = await credentialRows(b.database, world.organizationId);
    const auditBefore = await auditRowsFull(b.database, world.organizationId);

    const res = await invoke(llmApi(b.app, world.actors[role]), procedure);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("FORBIDDEN");
    expect(JSON.stringify(res.body)).not.toContain(secret);
    expect(await credentialRows(b.database, world.organizationId)).toEqual(rowsBefore);
    expect(await auditRowsFull(b.database, world.organizationId)).toEqual(auditBefore);
  });

  it("sans session : 401 UNAUTHORIZED", async () => {
    const { b } = await seeded();
    const res = await invoke(llmApi(b.app, undefined), procedure);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("UNAUTHORIZED");
  });
});

describe("le refus de rôle précède la validation et la recherche", () => {
  it.each(DENIED)(
    "%s : entrée invalide ou clé absente, toujours 403 (jamais 422 ni 404)",
    async (role) => {
      const b = bench();
      const world = await worldOf(b);
      const api = llmApi(b.app, world.actors[role]);
      expect((await api.set(PROVIDER, { apiKey: "" })).status).toBe(403);
      expect((await api.set("fake", { apiKey: secret })).status).toBe(403);
      expect((await api.remove(PROVIDER)).status).toBe(403);
      expect((await api.invalidate("fake")).status).toBe(403);
    },
  );
});

describe("tokens d'automatisation (CLI, MCP) : session humaine seulement", () => {
  const CASES: [string, "get" | "put" | "post" | "delete", string, Record<string, unknown>?][] = [
    ["list", "get", ROUTE],
    ["set", "put", `${ROUTE}/${PROVIDER}`, { provider: PROVIDER, apiKey: secret }],
    ["remove", "delete", `${ROUTE}/${PROVIDER}`],
    ["invalidate", "post", `${ROUTE}/${PROVIDER}/invalidate`, { provider: PROVIDER }],
  ];

  it.each(CASES)(
    "%s : un jeton Bearer seul reçoit 401, sans effet",
    async (_n, method, path, body) => {
      const { b, world } = await seeded();
      const before = await credentialRows(b.database, world.organizationId);
      const res = await withBearer(b.app, method, path, "jeton-d-automatisation-factice", body);
      expect(res.status).toBe(401);
      expect(res.body.code).toBe("UNAUTHORIZED");
      expect(await credentialRows(b.database, world.organizationId)).toEqual(before);
    },
  );

  it.each(CASES)(
    "%s : un jeton Bearer n'élève pas un rôle refusé (cookie dev + Bearer)",
    async (_n, method, path, body) => {
      const { b, world } = await seeded();
      const req = withBearer(b.app, method, path, "jeton-d-automatisation-factice", body).set(
        "Cookie",
        world.actors.dev.cookie,
      );
      const res = await req;
      expect(res.status).toBe(403);
      expect(res.body.code).toBe("FORBIDDEN");
    },
  );
});

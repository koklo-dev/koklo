import { describe, expect, it } from "vitest";
import { generateOpenApi } from "../src/index.ts";
import { errors, isValid } from "./support.ts";

/**
 * TK-48a2 (contrat 0.7.0) : `installation.start` répond 503 quand l'App n'a pas ses identifiants
 * client (ou la clé de chiffrement) et 422 quand l'utilisateur a trop d'états en attente. Ces deux
 * réponses doivent être typées au contrat, faute de quoi le web ne peut pas les distinguer.
 */
describe("installation.start : erreurs typées (0.7.0)", () => {
  it("expose PROVIDER_UNAVAILABLE 503", () => {
    expect(errors("installation.start").PROVIDER_UNAVAILABLE?.status).toBe(503);
  });

  it("expose VALIDATION 422 { field, message } (trop d'états en attente)", async () => {
    const e = errors("installation.start").VALIDATION;
    expect(e?.status).toBe(422);
    expect(await isValid(e?.data, { field: "installationId", message: "too_many_pending" })).toBe(
      true,
    );
    expect(await isValid(e?.data, { field: "installationId" })).toBe(false);
  });

  it("conserve FORBIDDEN, NOT_FOUND, UNAUTHORIZED et INTERNAL", () => {
    const e = errors("installation.start");
    expect(e.FORBIDDEN?.status).toBe(403);
    expect(e.NOT_FOUND?.status).toBe(404);
    expect(e.UNAUTHORIZED?.status).toBe(401);
    expect(e.INTERNAL?.status).toBe(500);
  });

  it("installation.list n'expose ni PROVIDER_UNAVAILABLE ni VALIDATION (lecture en base seule)", () => {
    expect(errors("installation.list").PROVIDER_UNAVAILABLE).toBeUndefined();
    expect(errors("installation.list").VALIDATION).toBeUndefined();
  });

  it("le document OpenAPI décrit le 503 de installation.start et ne cite aucun chemin /api/github", async () => {
    const doc = (await generateOpenApi()) as {
      paths: Record<string, Record<string, { responses: Record<string, unknown> }>>;
    };
    const start = doc.paths["/provider/installations/start"]?.post;
    expect(Object.keys(start?.responses ?? {})).toContain("503");
    expect(Object.keys(doc.paths).filter((p) => p.includes("/api/github"))).toEqual([]);
  });
});

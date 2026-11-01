import { describe, expect, it } from "vitest";
import * as api from "../src/index.ts";
import { generateOpenApi } from "../src/index.ts";
import { errors, isValid, SHA } from "./support.ts";

/**
 * TK-45c2 (contrat 0.6.0) : un instantané d'index `failed` (ex. spec_too_large) est lisible par
 * `spec.head` (status/errorCode) ; les lectures qui ont besoin d'entités répondent par une erreur
 * typée SPEC_INDEX_FAILED (409) au lieu d'une page vide ou d'un 404 trompeur.
 */
const EXPOSERS = ["spec.listFeatures", "spec.getFeature"];
const OTHERS = ["spec.head", "specBatch.get", "specBatch.submit", "repo.list", "ticket.list"];
const data = (name: string) => errors(name).SPEC_INDEX_FAILED?.data;

describe("SF1 SPEC_INDEX_FAILED : déclaration", () => {
  it.each(EXPOSERS)("%s expose SPEC_INDEX_FAILED en 409", (name) => {
    expect(errors(name).SPEC_INDEX_FAILED?.status, name).toBe(409);
  });
  it.each(OTHERS)(
    "%s ne l'expose pas (spec.head rend status/errorCode, pas une erreur)",
    (name) => {
      expect(errors(name).SPEC_INDEX_FAILED, name).toBeUndefined();
    },
  );
  it("le déclarateur est exporté par l'index avec son statut", () => {
    const declared = (api as unknown as Record<string, { SPEC_INDEX_FAILED?: { status: number } }>)
      .specIndexFailedError;
    expect(declared?.SPEC_INDEX_FAILED?.status).toBe(409);
  });
  it("errorStatusMap connaît le code", () => {
    expect((api.errorStatusMap as Record<string, number>).SPEC_INDEX_FAILED).toBe(409);
  });
});

describe("SF2 SPEC_INDEX_FAILED : données", () => {
  it.each(EXPOSERS)("%s : data { errorCode non vide, commitSha de 40 hexa }", async (name) => {
    expect(data(name), name).toBeDefined();
    expect(await isValid(data(name), { errorCode: "spec_too_large", commitSha: SHA })).toBe(true);
    expect(await isValid(data(name), { errorCode: "", commitSha: SHA })).toBe(false);
    expect(await isValid(data(name), { errorCode: "spec_too_large", commitSha: "abc" })).toBe(
      false,
    );
    expect(await isValid(data(name), { commitSha: SHA })).toBe(false);
    expect(await isValid(data(name), { errorCode: "spec_too_large" })).toBe(false);
  });
});

describe("SF3 OpenAPI et empreinte", () => {
  type Doc = {
    paths: Record<string, Record<string, { responses: Record<string, unknown> }>>;
    components?: { schemas?: Record<string, unknown> };
  };
  it("publie la réponse 409 des deux lectures et pas celle de spec.head", async () => {
    const d = (await generateOpenApi()) as Doc;
    const codes = (path: string) => Object.keys(d.paths[path]?.get?.responses ?? {});
    expect(codes("/projects/{projectId}/spec/features")).toContain("409");
    expect(codes("/projects/{projectId}/spec/features/{specId}")).toContain("409");
    expect(codes("/projects/{projectId}/spec")).not.toContain("409");
  });
  it("le contrat compte 47 routes (les 4 de llmCredential ajoutées en 0.8.0, aucune autre)", async () => {
    const d = (await generateOpenApi()) as Doc;
    const operations = Object.values(d.paths).flatMap((methods) => Object.keys(methods));
    expect(operations).toHaveLength(47);
  });
});

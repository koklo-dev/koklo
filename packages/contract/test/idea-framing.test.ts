import { describe, expect, it } from "vitest";
import { generateOpenApi } from "../src/index.ts";
import { errors, input, isValid, output, proc, UUID, UUID2 } from "./support.ts";

/**
 * TK-91 lot A (contrat 2.6.0, additif) : maturité et version dans `idea.list`, `idea.freeze` (passage au cadrage),
 * `idea.synthesis.get` et `ai.ideaSynthesis`. Aucune sortie ne porte d'identifiant d'utilisateur ni d'e-mail.
 */
const BASE = "/projects/{projectId}/idea";
const INSTANT = "2026-11-09T10:00:00.000Z";
const SHA = "a".repeat(40);
const SYNTHESIS = {
  contentMd: "## Résumé\n\nUn outil de cadrage.",
  source: "idea-v1",
  generatedAt: INSTANT,
};

type Doc = { paths: Record<string, Record<string, { responses: Record<string, unknown> }>> };
const doc = async () => (await generateOpenApi()) as unknown as Doc;

describe("TK-91 : surface", () => {
  it.each([
    ["idea.freeze", "post", `${BASE}/freeze`],
    ["idea.synthesis.get", "get", `${BASE}/synthesis`],
    ["ai.ideaSynthesis", "post", "/projects/{projectId}/ai/idea/synthesis"],
  ])("%s : %s %s dans l'OpenAPI", async (name, method, path) => {
    expect(proc(name)).toBeDefined();
    expect((await doc()).paths[path]?.[method], `${method} ${path}`).toBeDefined();
  });

  it("idea.synthesis ne contient que get", () => {
    const group = (proc("idea") as unknown as Record<string, Record<string, unknown>>).synthesis;
    expect(Object.keys(group ?? {})).toEqual(["get"]);
  });
});

describe("idea.freeze : entrée, sortie et erreurs", () => {
  it("l'entrée exige le projet et une clé d'idempotence", async () => {
    const freeze = input("idea.freeze");
    expect(await isValid(freeze, { projectId: UUID, idempotencyKey: "freeze-1" })).toBe(true);
    expect(await isValid(freeze, { projectId: UUID })).toBe(false);
    expect(await isValid(freeze, { idempotencyKey: "freeze-1" })).toBe(false);
    expect(await isValid(freeze, { projectId: UUID, idempotencyKey: "" })).toBe(false);
  });

  it("la sortie dit le lot, l'étiquette et le sort de la Synthèse (jamais bloquant)", async () => {
    const out = output("idea.freeze");
    const ok = { batchId: UUID, tag: "idea-v1", synthesis: "generated" };
    expect(await isValid(out, ok)).toBe(true);
    expect(
      await isValid(out, { ...ok, synthesis: "skipped", synthesisError: "LLM_NOT_CONFIGURED" }),
    ).toBe(true);
    expect(await isValid(out, { ...ok, synthesis: "peut-être" })).toBe(false);
    expect(await isValid(out, { ...ok, batchId: "x" })).toBe(false);
    expect(await isValid(out, { batchId: UUID, synthesis: "generated" })).toBe(false);
  });

  it("refuse le seuil par FORBIDDEN motivé framing_threshold ; les autres refus existent", async () => {
    const map = errors("idea.freeze");
    for (const code of [
      "FORBIDDEN",
      "NOT_FOUND",
      "UNAUTHORIZED",
      "SPEC_BATCH_CONFLICT",
      "PROVIDER_UNAVAILABLE",
    ]) {
      expect(map[code], code).toBeDefined();
    }
    const data = map.FORBIDDEN?.data;
    expect(await isValid(data, { reason: "framing_threshold" })).toBe(true);
    expect(await isValid(data, { reason: "autre" })).toBe(false);
  });
});

describe("idea.synthesis.get et ai.ideaSynthesis", () => {
  it("synthesis.get : lecture du projet, rend la Synthèse ou null", async () => {
    expect(await isValid(input("idea.synthesis.get"), { projectId: UUID })).toBe(true);
    expect(await isValid(input("idea.synthesis.get"), {})).toBe(false);
    const out = output("idea.synthesis.get");
    expect(await isValid(out, SYNTHESIS)).toBe(true);
    expect(await isValid(out, { ...SYNTHESIS, source: null })).toBe(true);
    expect(await isValid(out, null)).toBe(true);
    expect(await isValid(out, { ...SYNTHESIS, generatedAt: "hier" })).toBe(false);
    expect(await isValid(out, { source: "idea-v1", generatedAt: INSTANT })).toBe(false);
    expect(errors("idea.synthesis.get").NOT_FOUND).toBeDefined();
    expect(errors("idea.synthesis.get").FORBIDDEN).toBeUndefined();
  });

  it("ai.ideaSynthesis : projet seul en entrée, la Synthèse en sortie, erreurs d'appel d'IA", async () => {
    expect(await isValid(input("ai.ideaSynthesis"), { projectId: UUID })).toBe(true);
    expect(await isValid(input("ai.ideaSynthesis"), { projectId: "x" })).toBe(false);
    expect(await isValid(output("ai.ideaSynthesis"), SYNTHESIS)).toBe(true);
    expect(await isValid(output("ai.ideaSynthesis"), null)).toBe(false);
    const map = errors("ai.ideaSynthesis");
    for (const code of [
      "FORBIDDEN",
      "NOT_FOUND",
      "LLM_NOT_CONFIGURED",
      "LLM_CAP_REACHED",
      "LLM_OUTPUT_INVALID",
      "PROMPT_REJECTED",
    ]) {
      expect(map[code], code).toBeDefined();
    }
  });

  it("aucune sortie ne porte d'identifiant d'utilisateur ni d'e-mail", async () => {
    for (const name of ["idea.synthesis.get", "ai.ideaSynthesis", "idea.freeze"]) {
      const schema = JSON.stringify(proc(name)?.["~orpc"].outputSchemas ?? []);
      expect(schema, name).not.toMatch(/userId|email|frozenBy/i);
    }
    const parsed = (await output("idea.synthesis.get")?.["~standard"].validate({
      ...SYNTHESIS,
      frozenBy: UUID2,
      email: "a@b.fr",
    })) as { value: Record<string, unknown> };
    expect(Object.keys(parsed.value).sort()).toEqual(["contentMd", "generatedAt", "source"]);
  });
});

const LIST_PAGE = {
  id: UUID,
  slug: "vision",
  title: "Vision",
  position: 0,
  required: true,
  origin: "template",
  status: "stable",
  version: 3,
  updatedAt: INSTANT,
  updatedBy: null,
  deletedAt: null,
  pendingProposals: 0,
};
const list = {
  pages: [LIST_PAGE],
  trash: [],
  total: 1,
  publication: { available: true, last: null },
  pendingPageProposals: [],
  maturity: {
    stable: 1,
    total: 4,
    missingRequired: ["Utilisateurs", "Périmètre"],
    openQuestions: 2,
  },
  version: {
    latest: { number: 1, tag: "idea-v1", commitSha: SHA, frozenAt: INSTANT },
    modifiedSince: true,
  },
};

describe("idea.list : maturité et version", () => {
  it("accepte la maturité, la dernière version figée ou aucune", async () => {
    const out = output("idea.list");
    expect(await isValid(out, list)).toBe(true);
    expect(await isValid(out, { ...list, version: { latest: null, modifiedSince: false } })).toBe(
      true,
    );
  });

  it("exige les deux blocs et leurs champs", async () => {
    const out = output("idea.list");
    expect(await isValid(out, { ...list, maturity: undefined })).toBe(false);
    expect(await isValid(out, { ...list, version: undefined })).toBe(false);
    expect(await isValid(out, { ...list, maturity: { ...list.maturity, openQuestions: -1 } })).toBe(
      false,
    );
    expect(
      await isValid(out, { ...list, maturity: { ...list.maturity, missingRequired: [3] } }),
    ).toBe(false);
    expect(
      await isValid(out, { ...list, version: { ...list.version, modifiedSince: "oui" } }),
    ).toBe(false);
  });

  it("la version ne porte aucun identifiant d'utilisateur", async () => {
    const parsed = (await output("idea.list")?.["~standard"].validate({
      ...list,
      version: {
        ...list.version,
        latest: { ...list.version.latest, frozenBy: UUID2, email: "a@b.fr" },
      },
    })) as { value: { version: { latest: Record<string, unknown> } } };
    expect(Object.keys(parsed.value.version.latest).sort()).toEqual([
      "commitSha",
      "frozenAt",
      "number",
      "tag",
    ]);
  });
});

describe("specBatch.get : opérations du passage au cadrage", () => {
  const batch = (kind: string) => ({
    id: UUID,
    branch: "cadrage",
    status: "committed",
    idempotencyKey: "freeze-1",
    baseSha: null,
    commitSha: SHA,
    errorCode: null,
    report: null,
    results: [{ position: 1, kind, specId: null }],
    enqueuedAt: INSTANT,
    committedAt: INSTANT,
  });

  it.each(["idea.synthesis.write", "idea.version.tag"])("rapporte l'opération %s", async (kind) => {
    expect(await isValid(output("specBatch.get"), batch(kind))).toBe(true);
  });

  it("refuse une opération inconnue", async () => {
    expect(await isValid(output("specBatch.get"), batch("idea.version.delete"))).toBe(false);
  });
});

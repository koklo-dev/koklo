import { describe, expect, it } from "vitest";
import * as api from "../src/index.ts";
import { generateOpenApi } from "../src/index.ts";
import { errors, INSTANT, input, isValid, output, proc, UUID, UUID2 } from "./support.ts";

/**
 * TK-88 (contrat 2.1.0, additif) : la coquille. `project.shell|visit|recent` et `search.query`.
 * Aucun champ d'organisation ou d'utilisateur en entrée : ils viennent de la session.
 */
const KEYS = ["functional", "data", "architecture", "technical", "security", "design", "quality"];
const deliverables = KEYS.map((key, index) => ({
  key,
  available: index === 0,
  after: index === 0 ? null : "le fonctionnel",
}));
const SHELL = {
  id: UUID,
  name: "Koklo",
  phase: "framing",
  deliverables,
  validatedCount: 0,
  ticketCount: 12,
};

type Doc = {
  info: { version: string };
  paths: Record<string, Record<string, { responses: Record<string, unknown> }>>;
};
const doc = async () => (await generateOpenApi()) as unknown as Doc;

describe("SH1 surface additive", () => {
  it.each([
    ["project.shell", "get", "/projects/{projectId}/shell"],
    ["project.visit", "post", "/projects/{projectId}/visit"],
    ["project.recent", "get", "/project-visits"],
    ["search.query", "get", "/search"],
  ])("%s : %s %s dans l'OpenAPI", async (name, method, path) => {
    expect(proc(name), name).toBeDefined();
    expect((await doc()).paths[path]?.[method], `${method} ${path}`).toBeDefined();
  });

  it("les procédures de project existantes sont inchangées (list, create) ; cinq s'ajoutent en 2.1.0 à 2.7.0, quatre en 2.8.0", () => {
    const group = (api.contract as unknown as Record<string, object>).project;
    expect(Object.keys(group ?? {}).sort()).toEqual([
      "activity",
      "cards",
      "create",
      "creationStatus",
      "list",
      "overview",
      "recent",
      "retryRepo",
      "setEuOnly",
      "shell",
      "visit",
    ]);
  });

  it("le contrat est en 2.9.0 (version mineure : aucune route retirée ni modifiée)", async () => {
    expect(api.CONTRACT_VERSION).toBe("2.9.0");
    expect((await doc()).info.version).toBe("2.9.0");
  });
});

describe("SH2 project.shell", () => {
  it("entrée : projectId UUID seul", async () => {
    expect(await isValid(input("project.shell"), { projectId: UUID })).toBe(true);
    for (const projectId of ["", "x", undefined]) {
      expect(await isValid(input("project.shell"), { projectId })).toBe(false);
    }
  });

  it("sortie : phase, sept livrables, compteurs", async () => {
    const out = output("project.shell");
    expect(await isValid(out, SHELL)).toBe(true);
    expect(await isValid(out, { ...SHELL, ticketCount: null })).toBe(true);
    for (const phase of ["idea", "framing", "iterations"]) {
      expect(await isValid(out, { ...SHELL, phase }), phase).toBe(true);
    }
    expect(await isValid(out, { ...SHELL, phase: "baseline" })).toBe(false);
    expect(await isValid(out, { ...SHELL, validatedCount: -1 })).toBe(false);
    expect(await isValid(out, { ...SHELL, ticketCount: -1 })).toBe(false);
    expect(await isValid(out, { ...SHELL, name: undefined })).toBe(false);
  });

  it("sortie : un livrable a une clé de la liste fermée, available et after (texte ou null)", async () => {
    const out = output("project.shell");
    const one = { key: "data", available: false, after: "le fonctionnel" };
    expect(await isValid(out, { ...SHELL, deliverables: [one] })).toBe(true);
    expect(await isValid(out, { ...SHELL, deliverables: [{ ...one, key: "billing" }] })).toBe(
      false,
    );
    expect(await isValid(out, { ...SHELL, deliverables: [{ ...one, available: "oui" }] })).toBe(
      false,
    );
    expect(await isValid(out, { ...SHELL, deliverables: [{ key: "data", available: true }] })).toBe(
      false,
    );
  });

  it("erreurs : 401, 404 et 500 ; jamais 403 (tout rôle ayant accès au projet)", () => {
    const e = errors("project.shell");
    expect(Object.keys(e).sort()).toEqual(["INTERNAL", "NOT_FOUND", "UNAUTHORIZED"]);
  });
});

describe("SH3 project.visit et project.recent", () => {
  it("visit : projectId UUID seul ; sortie { visitedAt } instant ISO", async () => {
    expect(await isValid(input("project.visit"), { projectId: UUID })).toBe(true);
    expect(await isValid(input("project.visit"), { projectId: "x" })).toBe(false);
    expect(await isValid(output("project.visit"), { visitedAt: INSTANT })).toBe(true);
    expect(await isValid(output("project.visit"), { visitedAt: "hier" })).toBe(false);
  });

  it("visit : 401, 404, 500 ; jamais 403", () => {
    expect(Object.keys(errors("project.visit")).sort()).toEqual([
      "INTERNAL",
      "NOT_FOUND",
      "UNAUTHORIZED",
    ]);
  });

  it("recent : sans entrée ; sortie : tableau de { id, name, visitedAt }, 8 au plus", async () => {
    const out = output("project.recent");
    const item = { id: UUID, name: "Koklo", visitedAt: INSTANT, initials: "KO", colorKey: 1 };
    expect(await isValid(out, [])).toBe(true);
    expect(await isValid(out, [item])).toBe(true);
    expect(
      await isValid(
        out,
        Array.from({ length: 8 }, () => item),
      ),
    ).toBe(true);
    expect(
      await isValid(
        out,
        Array.from({ length: 9 }, () => item),
      ),
    ).toBe(false);
    expect(await isValid(out, [{ id: UUID, name: "Koklo" }])).toBe(false);
  });

  it("recent : 401 et 500 seulement", () => {
    expect(Object.keys(errors("project.recent")).sort()).toEqual(["INTERNAL", "UNAUTHORIZED"]);
  });
});

describe("SH4 search.query", () => {
  it("entrée : q de 1 à 200 caractères, projectId UUID facultatif", async () => {
    const schema = input("search.query");
    expect(await isValid(schema, { q: "a" })).toBe(true);
    expect(await isValid(schema, { q: "a".repeat(200), projectId: UUID })).toBe(true);
    for (const bad of [{}, { q: "" }, { q: "a".repeat(201) }, { q: "a", projectId: "x" }]) {
      expect(await isValid(schema, bad), JSON.stringify(bad).slice(0, 40)).toBe(false);
    }
  });

  it("sortie : liste à total réel ; projets, fonctionnalités et tickets sont typés par kind", async () => {
    const out = output("search.query");
    const page = (items: unknown[], total = items.length) => ({
      items,
      nextCursor: null,
      previousCursor: null,
      offset: 0,
      total,
    });
    const project = { kind: "project", id: UUID, name: "Koklo" };
    const feature = { kind: "feature", projectId: UUID, specId: "F-001", title: "Connexion" };
    const ticket = {
      kind: "ticket",
      projectId: UUID,
      key: "TK-1",
      title: "Un ticket",
      status: "todo",
    };
    expect(await isValid(out, page([project, feature, ticket], 300))).toBe(true);
    expect(await isValid(out, page([]))).toBe(true);
    expect(await isValid(out, page([{ kind: "sprint", id: UUID2 }]))).toBe(false);
    expect(await isValid(out, page([{ ...feature, specId: undefined }]))).toBe(false);
    expect(await isValid(out, page([{ ...ticket, status: "nope" }]))).toBe(false);
  });

  it("erreurs : 401, 404 (projet inaccessible), 422 (saisie) et 500", () => {
    expect(Object.keys(errors("search.query")).sort()).toEqual([
      "INTERNAL",
      "NOT_FOUND",
      "UNAUTHORIZED",
      "VALIDATION",
    ]);
  });
});

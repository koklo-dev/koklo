import { emitFeatureMarkdown } from "@koklo/schema";
import { describe, expect, it } from "vitest";
import { integrityProblem, slugOf } from "./paths.ts";
import { planBatch } from "./plan.ts";
import type { BatchOperation, LoadedBatch } from "./types.ts";

const feature = (id: string, ecrans: string[] = []) => ({
  path: `features/${id}-x.md`,
  content: emitFeatureMarkdown({
    id,
    titre: `Feature ${id}`,
    statut: "brouillon",
    priorite: "should",
    tables: [],
    endpoints: [],
    ecrans,
    roles: [],
    regles: [],
    nfr: [],
    description: "",
    criteres: [],
  }),
});
const op = (kind: string, targetSpecId: string, payload = {}): BatchOperation => ({
  position: 1,
  kind,
  targetSpecId,
  payload,
});
const plan = (operations: BatchOperation[], files = [feature("F-001")], authorRole = "dev") =>
  planBatch({ operations, authorRole }, files);

describe("planBatch : conflits", () => {
  it("update ou delete d'une feature absente, create d'une feature présente", () => {
    for (const operations of [
      [op("feature.update", "F-009", { title: "x" })],
      [op("feature.delete", "F-009")],
      [op("feature.create", "F-001", { title: "x", priority: "must" })],
    ]) {
      expect(plan(operations)).toMatchObject({
        outcome: { status: "conflict", errorCode: "write_conflict" },
      });
    }
  });
});

describe("planBatch : changements", () => {
  it("create écrit un fichier, update garde le chemin, delete le supprime", () => {
    const result = plan(
      [
        op("feature.create", "F-002", { title: "Réservé été", priority: "must" }),
        op("feature.update", "F-001", { title: "Renommée" }),
      ],
      [feature("F-001"), feature("F-003")],
    );
    expect(result).toMatchObject({
      changes: [{ path: "features/F-002-reserve-ete.md" }, { path: "features/F-001-x.md" }],
    });
    expect(plan([op("feature.delete", "F-001")])).toMatchObject({
      changes: [{ path: "features/F-001-x.md", delete: true }],
    });
  });
});

describe("planBatch : designer, validation, émetteur", () => {
  it("designer : FORBIDDEN hors des features liées à un écran", () => {
    const files = [feature("F-001", ["S-a"]), feature("F-002")];
    const forbidden = { outcome: { status: "failed", errorCode: "FORBIDDEN" } };
    expect(plan([op("feature.update", "F-002", { title: "x" })], files, "designer")).toMatchObject(
      forbidden,
    );
    expect(plan([op("feature.delete", "F-002")], files, "designer")).toMatchObject(forbidden);
    expect(plan([op("feature.update", "F-001", { screens: [] })], files, "designer")).toMatchObject(
      forbidden,
    );
    expect(plan([op("feature.delete", "F-001")], files, "designer")).toHaveProperty("changes");
  });

  it("une référence pendante nouvelle : SPEC_INVALID avec rapport ; l'émetteur refuse un texte ambigu", () => {
    const dangling = plan([op("feature.update", "F-001", { tables: ["T-nulle"] })]);
    expect(dangling).toMatchObject({
      outcome: { errorCode: "SPEC_INVALID", report: { ok: false } },
    });
    const ambiguous = plan([op("feature.update", "F-001", { description: "a\n## Titre" })]);
    expect(ambiguous).toMatchObject({ outcome: { errorCode: "SPEC_INVALID" } });
  });

  it("un fichier existant illisible bloque la mise à jour mais pas la suppression", () => {
    const broken = [{ path: "features/F-001-x.md", content: "pas de front matter" }];
    expect(plan([op("feature.update", "F-001", { title: "x" })], broken)).toMatchObject({
      outcome: { errorCode: "SPEC_INVALID" },
    });
    expect(plan([op("feature.delete", "F-001")], broken)).toHaveProperty("changes");
  });
});

describe("chemins", () => {
  const batch = (over: Partial<LoadedBatch>, operations = [op("feature.delete", "F-001")]) =>
    ({ branch: "cadrage", repo: { specPath: null }, operations, ...over }) as LoadedBatch;

  it("slug sans accents, borné, avec repli", () => {
    expect(slugOf("Été à Noël !")).toBe("ete-a-noel");
    expect(slugOf("x".repeat(80))).toHaveLength(40);
    expect(slugOf("***")).toBe("feature");
    expect(slugOf(3)).toBe("feature");
  });

  it("intégrité : branche, specPath, kind et identifiant", () => {
    expect(integrityProblem(batch({}))).toBeUndefined();
    expect(integrityProblem(batch({ branch: "../x" }))).toBe("branch");
    expect(integrityProblem(batch({ repo: { specPath: "../x" } as LoadedBatch["repo"] }))).toBe(
      "specPath",
    );
    expect(integrityProblem(batch({}, [op("feature.delete", "F-1/x")]))).toBe("specId");
    expect(integrityProblem(batch({}, [op("table.drop", "F-001")]))).toBe("kind");
  });
});

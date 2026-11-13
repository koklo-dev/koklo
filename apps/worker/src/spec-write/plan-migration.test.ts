import { emitFeatureMarkdown, type SpecFile } from "@koklo/schema";
import { describe, expect, it } from "vitest";
import { defaultSubject } from "./message.ts";
import { integrityProblem } from "./paths.ts";
import { planBatch } from "./plan.ts";
import type { BatchOperation, LoadedBatch } from "./types.ts";

const MANIFEST = (version: number) =>
  `projet: demo\norganisation: acme\nspec_version: ${version}\nextends: []\nrepos: []\n`;
const feature = emitFeatureMarkdown({
  id: "F-001",
  titre: "Comptes",
  statut: "brouillon",
  priorite: "should",
  tables: ["T-user"],
  endpoints: ["E-users-list"],
  ecrans: [],
  roles: [],
  regles: [],
  nfr: [],
  description: "",
  criteres: [],
});
const V1: SpecFile[] = [
  { path: "koklo.project.yaml", content: MANIFEST(1) },
  { path: "features/F-001-comptes.md", content: feature },
  {
    path: "data/tables/T-user.yaml",
    content:
      "id: T-user\nchamps:\n  - { nom: id, type: uuid, nullable: false, unique: true }\n  - { nom: email, type: text, nullable: false, unique: true }\n",
  },
  {
    path: "api/endpoints/E-users-list.yaml",
    content: "id: E-users-list\nmethode: GET\nchemin: /users\ntables: [T-user]\n",
  },
  { path: ".koklo/rules.yaml", content: "version: 1\n" },
];

const op = (kind: string, payload: Record<string, unknown> = {}): BatchOperation => ({
  position: 1,
  kind,
  targetSpecId: null,
  payload,
});
const BATCH = { authorRole: "owner" } as const;
const MIGRATE = [op("spec.migrate")];
const REVERT = [op("spec.migrate.revert", { migrationBatchId: "b1" })];

function migrated(): SpecFile[] {
  const plan = planBatch({ ...BATCH, operations: MIGRATE }, V1);
  if (!("changes" in plan)) throw new Error("migration attendue");
  const byPath = new Map(V1.map((f) => [f.path, f.content]));
  for (const change of plan.changes) {
    if (change.delete === true) byPath.delete(change.path);
    else byPath.set(change.path, change.content);
  }
  return [...byPath].map(([path, content]) => ({ path, content }));
}

describe("spec.migrate", () => {
  it("rend les changements v2 d'un dépôt v1, sans résultat métier", () => {
    const plan = planBatch({ ...BATCH, operations: MIGRATE }, V1);
    if (!("changes" in plan)) throw new Error("changes attendus");
    const paths = plan.changes.map((c) => c.path);
    expect(paths).toEqual(
      expect.arrayContaining([
        "koklo.project.yaml",
        "data/tables/user.yaml",
        "api/endpoints/users.lister.yaml",
        "design/rules.yaml",
      ]),
    );
    expect(plan.changes.find((c) => c.path === "data/tables/T-user.yaml")?.delete).toBe(true);
  });

  it("un dépôt déjà v2 : SPEC_INVALID avec rapport, aucun changement", () => {
    const plan = planBatch({ ...BATCH, operations: MIGRATE }, migrated());
    expect(plan).toMatchObject({ outcome: { status: "failed", errorCode: "SPEC_INVALID" } });
    const report = "outcome" in plan && "report" in plan.outcome ? plan.outcome.report : undefined;
    expect(report?.issues[0]?.message).toContain("déjà au format v2");
  });
});

describe("spec.migrate.revert", () => {
  it("rend exactement les fichiers d'origine", () => {
    const plan = planBatch({ ...BATCH, operations: REVERT }, migrated(), undefined, V1);
    if (!("changes" in plan)) throw new Error("changes attendus");
    const byPath = new Map(migrated().map((f) => [f.path, f.content]));
    for (const change of plan.changes) {
      if (change.delete === true) byPath.delete(change.path);
      else byPath.set(change.path, change.content);
    }
    expect([...byPath].sort()).toEqual(V1.map((f) => [f.path, f.content]).sort());
  });

  it("un fichier migré modifié depuis : write_conflict", () => {
    const head = migrated().map((f) =>
      f.path === "data/tables/user.yaml" ? { ...f, content: `${f.content}# édité\n` } : f,
    );
    const plan = planBatch({ ...BATCH, operations: REVERT }, head, undefined, V1);
    expect(plan).toEqual({ outcome: { status: "conflict", errorCode: "write_conflict" } });
  });

  it("sans parent lu : INTERNAL", () => {
    const plan = planBatch({ ...BATCH, operations: REVERT }, migrated());
    expect(plan).toEqual({ outcome: { status: "failed", errorCode: "INTERNAL" } });
  });
});

describe("intégrité des lots de migration", () => {
  const lot = (operations: BatchOperation[]): LoadedBatch =>
    ({ branch: "cadrage", repo: { specPath: null }, operations }) as unknown as LoadedBatch;
  const ID = "0b9a4f4e-3a6f-4a39-9a3c-1f2f6c1f9e11";

  it("accepte une migration et un retour arrière seuls", () => {
    expect(integrityProblem(lot(MIGRATE))).toBeUndefined();
    expect(
      integrityProblem(lot([op("spec.migrate.revert", { migrationBatchId: ID })])),
    ).toBeUndefined();
  });

  it("refuse un retour arrière sans lot visé valide, et tout mélange avec d'autres opérations", () => {
    expect(integrityProblem(lot(REVERT))).toBe("payload");
    expect(integrityProblem(lot([op("spec.migrate.revert", {})]))).toBe("payload");
    const feature = { position: 2, kind: "feature.create", targetSpecId: "F-001", payload: {} };
    expect(integrityProblem(lot([...MIGRATE, feature]))).toBe("kind");
    expect(integrityProblem(lot([feature, ...MIGRATE]))).toBe("kind");
    expect(integrityProblem(lot([...MIGRATE, ...MIGRATE]))).toBe("kind");
  });

  it("objet du commit par défaut", () => {
    expect(defaultSubject(MIGRATE)).toBe("spec: migration vers le format v2");
    expect(defaultSubject(REVERT)).toBe("spec: retour arrière de la migration v2");
  });
});

/**
 * Parité du contrat 0.5.0 avec le domaine (TK-38/39), @koklo/schema (TK-40) et la base (TK-41).
 * Le contrat ne peut importer ni domain ni schema (`turbo boundaries`) : il porte des copies en dur
 * et ce test (placé dans l'api, qui voit le domaine) relit par chemin les sources de schema et de
 * db, comme `packages/db/test/spec-enum-parity.test.ts`.
 */
import * as contract from "@koklo/contract";
import { describe, expect, it } from "vitest";
import {
  accepts,
  api,
  inputOf,
  kept,
  literals,
  options,
  prismaEnum,
  read,
  sorted,
  zodEnum,
} from "./helpers/parity.ts";

const slugged = (key: string, prefix: string) => `${key}: new RegExp(\`^${prefix}-\${slug}$\`)`;
/** Définitions exactes de `packages/schema/src/entities/ids.ts` que le contrat recopie. */
const ID_SOURCE_LITERALS = [
  'const slug = "[a-z0-9][a-z0-9-]*";',
  "feature: /^F-\\d{3,}$/",
  "criterion: /^AC-\\d+$/",
  slugged("table", "T"),
  slugged("endpoint", "E"),
  slugged("screen", "S"),
  slugged("role", "RL"),
  "rule: /^R-\\d{3,}$/",
  slugged("nfr", "NFR"),
];

describe("D3 paquet schema : énumérations, étapes, identifiants", () => {
  it("statut et priorité des features", () => {
    const status = ["adoptee", "brouillon", "implementee", "specifiee"];
    const priority = ["could", "must", "should", "wont"];
    expect(zodEnum("feature.ts", "statut")).toEqual(status);
    expect(zodEnum("feature.ts", "priorite")).toEqual(priority);
    expect(options(api.featureStatusSchema)).toEqual(status);
    expect(options(api.featurePrioritySchema)).toEqual(priority);
    expect(prismaEnum("FeatureStatus")).toEqual(status);
    expect(prismaEnum("FeaturePriority")).toEqual(priority);
  });
  it("méthodes HTTP des endpoints (copie en dur ; non exposées en 0.5.0)", () => {
    const methods = ["DELETE", "GET", "PATCH", "POST", "PUT"];
    expect(zodEnum("data.ts", "methode")).toEqual(methods);
    expect(prismaEnum("EndpointMethod")).toEqual(methods);
  });
  it("types d'étapes de critère = STEP_TYPES de schema", () => {
    const steps = literals(
      /STEP_TYPES = \[([^\]]+)\]/.exec(read("packages/schema/src/entities/feature.ts"))?.[1] ?? "",
    );
    expect(sorted(steps)).toEqual(["alors", "et", "etant_donne", "quand"]);
    const output = (
      contract.contract as unknown as {
        spec: { getFeature: { "~orpc": { outputSchemas: unknown[] } } };
      }
    ).spec.getFeature["~orpc"].outputSchemas[0];
    const detail = (type: string) => ({
      specId: "F-001",
      title: "t",
      status: "brouillon",
      priority: "must",
      description: "",
      criteria: [{ specId: "AC-1", position: 1, title: "c", steps: [{ type, text: "x" }] }],
      tables: [],
      endpoints: [],
      screens: [],
      roles: [],
      rules: [],
      nfr: [],
      filePath: "features/F-001.md",
      commitSha: "0123456789abcdef0123456789abcdef01234567",
    });
    for (const type of steps) expect(accepts(output, detail(type)), type).toBe(true);
    expect(accepts(output, detail("puis"))).toBe(false);
  });
});

describe("D3b identifiants de la spec", () => {
  it("motifs d'identifiants : mêmes regex que schema/ids.ts, mêmes verdicts côté contrat", () => {
    const ids = read("packages/schema/src/entities/ids.ts");
    for (const literal of ID_SOURCE_LITERALS) expect(ids, literal).toContain(literal);
  });
  it("les verdicts du contrat sur les liens et F-nnn suivent ces regex", () => {
    const submit = inputOf("specBatch.submit");
    const project = "123e4567-e89b-42d3-a456-426614174000";
    const createWith = (patch: object) => ({
      projectId: project,
      idempotencyKey: "k",
      operations: [{ kind: "feature.create", title: "t", priority: "must", ...patch }],
    });
    const slug = "[a-z0-9][a-z0-9-]*";
    const cases: [string, RegExp, string[]][] = [
      [
        "tables",
        new RegExp(`^T-${slug}$`),
        ["T-user", "T-a-b", "T-", "T-A", "T--x", "user", "E-user"],
      ],
      [
        "endpoints",
        new RegExp(`^E-${slug}$`),
        ["E-login", "E-a1", "E-", "E-_x", "login", "T-login"],
      ],
      ["screens", new RegExp(`^S-${slug}$`), ["S-login", "S-", "S-Login", "login"]],
      ["roles", new RegExp(`^RL-${slug}$`), ["RL-owner", "RL-", "RL-Owner", "owner"]],
      ["rules", /^R-\d{3,}$/, ["R-001", "R-1234", "R-1", "R-12a", "R001"]],
      ["nfr", new RegExp(`^NFR-${slug}$`), ["NFR-perf", "NFR-", "NFR-Perf", "perf"]],
    ];
    for (const [field, regex, samples] of cases) {
      for (const sample of samples) {
        expect(accepts(submit, createWith({ [field]: [sample] })), `${field} ${sample}`).toBe(
          regex.test(sample),
        );
      }
    }
    for (const sample of ["F-001", "F-1234", "F-1", "F-12", "f-001", "AC-1"]) {
      expect(
        accepts(submit, {
          ...createWith({}),
          operations: [{ kind: "feature.delete", specId: sample }],
        }),
        sample,
      ).toBe(/^F-\d{3,}$/.test(sample));
    }
  });
});

describe("D3c codes de diagnostic", () => {
  it("chaque code d'ISSUE_CODES est accepté par specIssueSchema (copie du contrat public de schema)", () => {
    const codes = [...read("packages/schema/src/codes.ts").matchAll(/^\s+(\w+): "\1",$/gm)].map(
      (m) => m[1] as string,
    );
    expect(codes.length).toBeGreaterThan(20);
    for (const code of codes) {
      for (const rule of [4, 5, 7, "structure"]) {
        const issue = {
          rule,
          code,
          severity: "error",
          path: "features/F-001.md",
          pointer: "",
          message: "m",
        };
        expect(accepts(api.specIssueSchema, issue), `${code}/${rule}`).toBe(true);
      }
    }
  });
});

describe("D4 FeatureSchema : chaque champ a un homologue dans le détail et dans les opérations", () => {
  const FIELDS: Record<string, string> = {
    id: "specId",
    titre: "title",
    statut: "status",
    priorite: "priority",
    tables: "tables",
    endpoints: "endpoints",
    ecrans: "screens",
    roles: "roles",
    regles: "rules",
    nfr: "nfr",
    description: "description",
    criteres: "criteria",
  };
  it("la table de correspondance couvre exactement les champs de FeatureSchema", () => {
    const source = read("packages/schema/src/entities/feature.ts");
    const block = /FeatureSchema = z\.strictObject\(\{([\s\S]*?)\n\}\);/.exec(source)?.[1] ?? "";
    const keys = [...block.matchAll(/^\s{2}(\w+):/gm)].map((m) => m[1] as string);
    expect(sorted(keys)).toEqual(sorted(Object.keys(FIELDS)));
  });
  it("featureDetailSchema expose tous les homologues", () => {
    const shape = Object.keys((api.featureDetailSchema as { shape: object }).shape);
    for (const english of Object.values(FIELDS)) expect(shape, english).toContain(english);
  });
});

describe("D4b homologues dans les opérations", () => {
  it("feature.create et feature.update acceptent et conservent chaque homologue modifiable", () => {
    const submit = inputOf("specBatch.submit");
    const samples: Record<string, unknown> = {
      title: "t",
      status: "specifiee",
      priority: "could",
      description: "d",
      tables: ["T-user"],
      endpoints: ["E-login"],
      screens: ["S-login"],
      roles: ["RL-owner"],
      rules: ["R-001"],
      nfr: ["NFR-perf"],
      criteria: [],
    };
    const wrap = (op: object) => ({
      projectId: "123e4567-e89b-42d3-a456-426614174000",
      idempotencyKey: "k",
      operations: [op],
    });
    for (const [field, value] of Object.entries(samples)) {
      const create = kept(
        submit,
        wrap({ kind: "feature.create", title: "t", priority: "must", [field]: value }),
      ) as { operations: Record<string, unknown>[] } | undefined;
      expect(create?.operations[0]?.[field], `create ${field}`).toEqual(value);
      const update = kept(
        submit,
        wrap({ kind: "feature.update", specId: "F-001", [field]: value }),
      ) as { operations: Record<string, unknown>[] } | undefined;
      expect(update?.operations[0]?.[field], `update ${field}`).toEqual(value);
    }
  });
});

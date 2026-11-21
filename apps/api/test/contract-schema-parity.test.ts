/**
 * Parité du contrat 0.5.0 avec le domaine (TK-38/39), @koklo/schema (TK-40) et la base (TK-41).
 * Le contrat ne peut importer ni domain ni schema (`turbo boundaries`) : il porte des copies en dur
 * et ce test (placé dans l'api, qui voit le domaine) relit par chemin les sources de schema et de
 * db, comme `packages/db/test/spec-enum-parity.test.ts`.
 */
import * as contract from "@koklo/contract";
import * as schema from "@koklo/schema";
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
  "endpoint: new RegExp(`^(E-${slug}|${slug}\\\\.${slug})$`)",
  slugged("screen", "S"),
  slugged("role", "RL"),
  "rule: /^R-\\d{3,}$/",
  slugged("nfr", "NFR"),
];

describe("TK-103 : règles, rôles et parcours (contrat 3.1.0)", () => {
  it("types de règle du contrat = ceux de BusinessRuleSchema", () => {
    const types = ["calcul", "contrainte", "workflow"];
    expect(zodEnum("domain.ts", "type")).toEqual(types);
    expect(options(api.ruleTypeSchema)).toEqual(types);
  });
  it("identifiants R-, RL-, P- et PM- du contrat = ceux de schema", () => {
    const source = read("packages/schema/src/entities/ids.ts");
    expect(source).toContain(slugged("flow", "P"));
    for (const [schema, ok, bad] of [
      [api.ruleIdSchema, "R-007", "R-7"],
      [api.roleIdSchema, "RL-chef", "RL-Chef"],
      [api.flowIdSchema, "P-inscription", "P-"],
      [api.permissionIdSchema, "PM-agenda.lire", "PM-"],
    ] as const) {
      const parser = schema as { safeParse(value: unknown): { success: boolean } };
      expect(parser.safeParse(ok).success, ok).toBe(true);
      expect(parser.safeParse(bad).success, bad).toBe(false);
    }
  });
});

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
        new RegExp(`^(E-${slug}|${slug}\\.${slug})$`),
        ["E-login", "E-a1", "E-", "E-_x", "login", "T-login", "reservation.lister", "a.b.c", "a."],
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
    zone: "zone",
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
      zone: "Authentification",
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

describe("TK-108 : positions du diagramme (contrat 3.6.0, sans entité de base)", () => {
  it("plafonds du contrat = ceux de data/_layout.yaml (schema) : coordonnées 0 à 20000, 500 entrées", () => {
    const source = read("packages/schema/src/entities/layout.ts");
    expect(source).toContain("LAYOUT_COORD_MAX = 20000");
    expect(source).toContain("LAYOUT_MAX_ENTRIES = 500");
    const save = inputOf("spec.data.layout.save");
    const wrap = (positions: unknown) => ({
      projectId: "123e4567-e89b-42d3-a456-426614174000",
      idempotencyKey: "k",
      positions,
    });
    expect(accepts(save, wrap({ "T-a": { x: 0, y: 20000 } }))).toBe(true);
    expect(accepts(save, wrap({ "T-a": { x: 0, y: 20001 } }))).toBe(false);
    expect(accepts(save, wrap({ "T-a": { x: -1, y: 0 } }))).toBe(false);
    const entries = (count: number) =>
      Object.fromEntries(Array.from({ length: count }, (_, i) => [`T-t${i}`, { x: 0, y: 0 }]));
    expect(accepts(save, wrap(entries(500)))).toBe(true);
    expect(accepts(save, wrap(entries(501)))).toBe(false);
  });

  it("identifiants de table du contrat = ceux de schema (T-slug)", () => {
    const save = inputOf("spec.data.layout.save");
    const wrap = (id: string) => ({
      projectId: "123e4567-e89b-42d3-a456-426614174000",
      idempotencyKey: "k",
      positions: { [id]: { x: 1, y: 1 } },
    });
    expect(accepts(save, wrap("T-client"))).toBe(true);
    expect(accepts(save, wrap("T-"))).toBe(false);
    expect(accepts(save, wrap("T-Client"))).toBe(false);
  });
});

describe("TK-109 : résumé client des tables (contrat 3.7.0)", () => {
  it("plafonds de clientSummary du contrat = ceux de resume_client (schema) : 12 phrases de 1 à 200 caractères", () => {
    const source = read("packages/schema/src/entities/data-v2.ts");
    expect(source).toContain("resume_client: z.array(z.string().min(1).max(200)).max(12)");
    const update = inputOf("specBatch.submit");
    const op = (clientSummary: string[]) => ({
      projectId: "123e4567-e89b-42d3-a456-426614174000",
      idempotencyKey: "k",
      operations: [{ kind: "table.update", specId: "T-client", clientSummary }],
    });
    expect(accepts(update, op(Array.from({ length: 12 }, () => "x".repeat(200))))).toBe(true);
    expect(accepts(update, op(Array.from({ length: 13 }, () => "x")))).toBe(false);
    expect(accepts(update, op(["x".repeat(201)]))).toBe(false);
    expect(accepts(update, op([""]))).toBe(false);
  });

  it("commentaire de table : valeur d'enum et colonne alignées sur la base", () => {
    expect(prismaEnum("CommentTargetKind")).toContain("table");
    expect(options(api.commentTargetKindSchema)).toContain("table");
    expect(read("packages/db/prisma/schema.prisma")).toContain(
      'targetRef      String?           @map("target_ref")',
    );
  });
});

/** TK-111 : l'Architecture du contrat 3.9.0 recopie les vocabulaires et les motifs de @koklo/schema. */
// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'un même livrable, un test par comportement
describe("TK-111 : architecture (contrat 3.9.0)", () => {
  const op = (operation: Record<string, unknown>) => ({
    projectId: "123e4567-e89b-42d3-a456-426614174000",
    idempotencyKey: "k",
    operations: [operation],
  });
  const submit = inputOf("specBatch.submit");

  it("types de composant, statuts de décision et de section du contrat = ceux de schema", () => {
    expect(sorted(options(api.componentTypeSchema))).toEqual(sorted([...schema.COMPONENT_TYPES]));
    expect(sorted(options(api.adrStatusSchema))).toEqual(sorted([...schema.ADR_STATUSES]));
    expect(sorted(options(api.docSectionStatusSchema))).toEqual(
      sorted([...schema.DOC_SECTION_STATUSES]),
    );
  });

  it("identifiants C-<slug> et ADR-nnn du contrat = ceux de schema", () => {
    for (const [pattern, id] of [
      [schema.PATTERNS.component, "C-api"],
      [schema.PATTERNS.component, "C-Api"],
      [schema.PATTERNS.adr, "ADR-001"],
      [schema.PATTERNS.adr, "ADR-1"],
    ] as const) {
      const operation = { kind: "component.delete", specId: id };
      const accepted = accepts(
        submit,
        op(id.startsWith("ADR") ? { kind: "adr.delete", specId: id } : operation),
      );
      expect(accepted, id).toBe(pattern.test(id));
    }
  });

  it("types de propositions : un champ par champ des schémas de proposition de schema (component, archflow, adr, doc_section)", () => {
    const kinds = ["component", "archflow", "adr", "doc_section"];
    for (const kind of kinds) expect(options(api.proposalKindSchema)).toContain(kind);
    expect(Object.keys(schema.PROPOSAL_SCHEMAS)).toEqual(expect.arrayContaining(kinds));
  });

  it("codes d'avertissement du contrat = codes ARCH_ de ISSUE_CODES (les six avertissements, sans les erreurs de référence)", () => {
    const warnings = Object.values(schema.ISSUE_CODES).filter(
      (code) => code.startsWith("ARCH_") && !code.startsWith("ARCH_UNKNOWN_"),
    );
    expect(sorted([...contract.ARCHITECTURE_CHECK_CODES])).toEqual(sorted(warnings));
  });

  it("plafonds du contrat = ceux des schémas de proposition : nom de composant 120, responsabilité 500, 30 dépendances", () => {
    const create = (over: Record<string, unknown>) =>
      op({
        kind: "component.create",
        name: "A",
        type: "app",
        zone: "Z",
        responsibility: "R",
        ...over,
      });
    expect(accepts(submit, create({ name: "x".repeat(120) }))).toBe(true);
    expect(accepts(submit, create({ name: "x".repeat(121) }))).toBe(false);
    expect(accepts(submit, create({ responsibility: "x".repeat(501) }))).toBe(false);
    const link = { to: "C-b", via: "HTTP" };
    expect(accepts(submit, create({ dependsOn: Array.from({ length: 30 }, () => link) }))).toBe(
      true,
    );
    expect(accepts(submit, create({ dependsOn: Array.from({ length: 31 }, () => link) }))).toBe(
      false,
    );
    const proposal = schema.PROPOSAL_SCHEMAS.component;
    const valid = { name: "x".repeat(120), type: "app", zone: "Z", responsibility: "R" };
    expect(proposal.safeParse(valid).success).toBe(true);
    expect(proposal.safeParse({ ...valid, name: "x".repeat(121) }).success).toBe(false);
  });
});

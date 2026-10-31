import { describe, expect, it } from "vitest";
import * as api from "../src/index.ts";
import { generateOpenApi } from "../src/index.ts";
import { errors, isValid, report, UUID } from "./support.ts";

const NEW_ROUTES = [
  "installation.list",
  "installation.start",
  "repo.list",
  "repo.link",
  "repo.createSpec",
  "spec.head",
  "spec.listFeatures",
  "spec.getFeature",
  "specBatch.submit",
  "specBatch.get",
];
const OLD_ROUTES = [
  "health",
  "ticket.create",
  "ticket.get",
  "ticket.list",
  "ticket.update",
  "ticket.delete",
  "ticket.transition",
  "dependency.add",
  "dependency.remove",
  "dependency.list",
  "sprint.create",
  "sprint.get",
  "sprint.list",
  "sprint.update",
  "sprint.activate",
  "sprint.close",
  "comment.create",
  "comment.list",
  "comment.delete",
  "projectState.get",
  "projectState.update",
  "lease.acquire",
  "lease.heartbeat",
  "lease.release",
  "lease.get",
  "audit.list",
];
const EVERY = [...OLD_ROUTES, ...NEW_ROUTES];

/** Routes qui peuvent parler au fournisseur (H10). */
const PROVIDER_ROUTES = ["repo.link", "repo.createSpec", "spec.getFeature", "specBatch.submit"];

describe("X1 socle des routes 0.5.0 : INTERNAL 500 et UNAUTHORIZED 401", () => {
  it.each(NEW_ROUTES)("%s expose INTERNAL (requestId) et UNAUTHORIZED", async (name) => {
    expect(errors(name).INTERNAL?.status, name).toBe(500);
    expect(await isValid(errors(name).INTERNAL?.data, { requestId: "r" }), name).toBe(true);
    expect(errors(name).UNAUTHORIZED?.status, name).toBe(401);
  });
});

describe("X2 FORBIDDEN / NOT_FOUND / VALIDATION par route", () => {
  const FORBIDDEN = [
    "installation.list",
    "installation.start",
    "repo.list",
    "repo.link",
    "repo.createSpec",
    "specBatch.submit",
    "specBatch.get",
  ];
  const NOT_FOUND = [
    "installation.start",
    "repo.list",
    "repo.link",
    "repo.createSpec",
    "spec.head",
    "spec.listFeatures",
    "spec.getFeature",
    "specBatch.submit",
    "specBatch.get",
  ];
  const VALIDATION = [
    "repo.link",
    "repo.createSpec",
    "spec.head",
    "spec.listFeatures",
    "specBatch.submit",
  ];
  it.each(FORBIDDEN)("%s expose FORBIDDEN 403", (name) => {
    expect(errors(name).FORBIDDEN?.status, name).toBe(403);
  });
  it.each(["spec.head", "spec.listFeatures", "spec.getFeature"])(
    "%s (lecture ouverte à tous les rôles) n'expose pas FORBIDDEN",
    (name) => {
      expect(errors(name).FORBIDDEN, name).toBeUndefined();
    },
  );
  it.each(NOT_FOUND)("%s expose NOT_FOUND 404", (name) => {
    expect(errors(name).NOT_FOUND?.status, name).toBe(404);
  });
  it("installation.list n'expose pas NOT_FOUND", () => {
    expect(errors("installation.list").NOT_FOUND).toBeUndefined();
  });
  it.each(VALIDATION)("%s expose VALIDATION 422 { field, message }", async (name) => {
    const e = errors(name).VALIDATION;
    expect(e?.status, name).toBe(422);
    expect(await isValid(e?.data, { field: "branch", message: "conflit" }), name).toBe(true);
    expect(await isValid(e?.data, { field: "branch" }), name).toBe(false);
  });
});

describe("X3 REPO_CREATION_FORBIDDEN", () => {
  const data = () => errors("repo.createSpec").REPO_CREATION_FORBIDDEN?.data;
  it("403 sur repo.createSpec : { reason, ownerLogin, ownerKind }", async () => {
    expect(errors("repo.createSpec").REPO_CREATION_FORBIDDEN?.status).toBe(403);
    for (const reason of ["missing-user-token", "resource-not-accessible"]) {
      expect(
        await isValid(data(), { reason, ownerLogin: "koklo-hq", ownerKind: "organization" }),
      ).toBe(true);
    }
    expect(
      await isValid(data(), { reason: "missing_user_token", ownerLogin: "a", ownerKind: "user" }),
    ).toBe(false);
    expect(await isValid(data(), { reason: "autre", ownerLogin: "a", ownerKind: "user" })).toBe(
      false,
    );
    expect(await isValid(data(), { reason: "missing-user-token", ownerKind: "user" })).toBe(false);
    expect(
      await isValid(data(), { reason: "missing-user-token", ownerLogin: "a", ownerKind: "team" }),
    ).toBe(false);
    expect(await isValid(data(), { reason: "missing-user-token", ownerLogin: "a" })).toBe(false);
  });
});

describe("X4 USER_TOKEN_REQUIRED", () => {
  const data = () => errors("repo.createSpec").USER_TOKEN_REQUIRED?.data;
  it("403 sur repo.createSpec : { ownerLogin }", async () => {
    expect(errors("repo.createSpec").USER_TOKEN_REQUIRED?.status).toBe(403);
    expect(await isValid(data(), { ownerLogin: "yahse" })).toBe(true);
    expect(await isValid(data(), {})).toBe(false);
    expect(await isValid(data(), { ownerLogin: 1 })).toBe(false);
  });
});

describe("X5 PROVIDER_AUTH_EXPIRED, PROVIDER_RATE_LIMITED, PROVIDER_UNAVAILABLE", () => {
  it.each(PROVIDER_ROUTES)(
    "PROVIDER_AUTH_EXPIRED 403 sur %s : { kind, refreshable }",
    async (name) => {
      const e = errors(name).PROVIDER_AUTH_EXPIRED;
      expect(e?.status, name).toBe(403);
      expect(await isValid(e?.data, { kind: "installation", refreshable: false })).toBe(true);
      expect(await isValid(e?.data, { kind: "user", refreshable: true })).toBe(true);
      expect(await isValid(e?.data, { kind: "app", refreshable: true })).toBe(false);
      expect(await isValid(e?.data, { kind: "user" })).toBe(false);
      expect(await isValid(e?.data, { refreshable: true })).toBe(false);
    },
  );
  it.each(PROVIDER_ROUTES)("PROVIDER_RATE_LIMITED 429 sur %s : { retryAfterMs? }", async (name) => {
    const e = errors(name).PROVIDER_RATE_LIMITED;
    expect(e?.status, name).toBe(429);
    expect(await isValid(e?.data, {})).toBe(true);
    expect(await isValid(e?.data, { retryAfterMs: 1500 })).toBe(true);
    expect(await isValid(e?.data, { retryAfterMs: "1s" })).toBe(false);
  });
  it.each(PROVIDER_ROUTES)("PROVIDER_UNAVAILABLE 503 sur %s", (name) => {
    expect(errors(name).PROVIDER_UNAVAILABLE?.status, name).toBe(503);
  });
});

describe("X6 SPEC_BATCH_CONFLICT", () => {
  const data = () => errors("specBatch.submit").SPEC_BATCH_CONFLICT?.data;
  it("409 sur specBatch.submit : { reason, batchId? } avec 3 raisons", async () => {
    expect(errors("specBatch.submit").SPEC_BATCH_CONFLICT?.status).toBe(409);
    for (const reason of ["idempotency_key_reused", "stale_base", "write_conflict"]) {
      expect(await isValid(data(), { reason }), reason).toBe(true);
      expect(await isValid(data(), { reason, batchId: UUID }), reason).toBe(true);
    }
    expect(await isValid(data(), { reason: "autre" })).toBe(false);
    expect(await isValid(data(), { reason: "stale_base", batchId: "x" })).toBe(false);
    expect(await isValid(data(), {})).toBe(false);
  });
});

describe("X7 SPEC_INVALID", () => {
  const data = () => errors("specBatch.submit").SPEC_INVALID?.data;
  it("422 sur specBatch.submit : { report } au format du ValidationReport", async () => {
    expect(errors("specBatch.submit").SPEC_INVALID?.status).toBe(422);
    expect(await isValid(data(), { report })).toBe(true);
    expect(
      await isValid(data(), {
        report: {
          ...report,
          issues: [],
          truncated: false,
          ok: true,
          counts: { error: 0, warning: 0 },
        },
      }),
    ).toBe(true);
    expect(await isValid(data(), {})).toBe(false);
  });
  it("refuse un rapport mal formé", async () => {
    const bad = (patch: object) => ({ report: { ...report, ...patch } });
    expect(await isValid(data(), bad({ ok: "oui" }))).toBe(false);
    expect(await isValid(data(), bad({ counts: { error: 1 } }))).toBe(false);
    expect(await isValid(data(), bad({ truncated: undefined }))).toBe(false);
    expect(await isValid(data(), bad({ issues: [{ ...report.issues[0], rule: 6 }] }))).toBe(false);
    expect(
      await isValid(data(), bad({ issues: [{ ...report.issues[0], severity: "info" }] })),
    ).toBe(false);
    expect(
      await isValid(data(), bad({ issues: [{ ...report.issues[0], message: undefined }] })),
    ).toBe(false);
    expect(
      await isValid(data(), bad({ issues: [{ ...report.issues[0], pointer: undefined }] })),
    ).toBe(false);
  });
  it("accepte toute règle (4, 5, 7, structure) et plafonne les issues à 100", async () => {
    const issue = report.issues[0];
    for (const rule of [4, 5, 7, "structure"]) {
      expect(
        await isValid(data(), { report: { ...report, issues: [{ ...issue, rule }] } }),
        String(rule),
      ).toBe(true);
    }
    const many = (n: number) => ({
      report: { ...report, issues: Array.from({ length: n }, () => issue) },
    });
    expect(await isValid(data(), many(100))).toBe(true);
    expect(await isValid(data(), many(101))).toBe(false);
  });
  it("entityId est optionnel", async () => {
    const { entityId: _omitted, ...withoutEntity } = report.issues[0] as Record<string, unknown>;
    expect(await isValid(data(), { report: { ...report, issues: [withoutEntity] } })).toBe(true);
  });
  it("specBatch.get expose le même rapport dans la sortie (voir spec-batch.test)", () => {
    expect(errors("specBatch.get").SPEC_INVALID).toBeUndefined();
  });
});

describe("X8 CONFLICT.reason : 3 nouvelles raisons", () => {
  const OLD = [
    "slug_taken",
    "already_member",
    "already_invited",
    "last_owner",
    "sprint_already_active",
    "sprint_not_planned",
    "sprint_not_active",
    "ticket_has_active_lease",
    "counter_limit_reached",
  ];
  const NEW = ["spec_repo_exists", "repo_already_linked", "repo_name_taken"];
  it("accepte les anciennes et les nouvelles raisons, rejette le reste", async () => {
    const data = api.conflictError.CONFLICT.data;
    for (const reason of [...OLD, ...NEW])
      expect(await isValid(data, { reason }), reason).toBe(true);
    expect(await isValid(data, { reason: "autre" })).toBe(false);
    expect(await isValid(api.conflictReasonSchema, "repo_exists")).toBe(false);
    expect([...api.conflictReasonSchema.options].sort()).toEqual([...OLD, ...NEW].sort());
  });
  it.each(["repo.link", "repo.createSpec"])("%s expose CONFLICT 409", (name) => {
    expect(errors(name).CONFLICT?.status, name).toBe(409);
  });
});

describe("X9 exposition exclusive des nouvelles erreurs typées", () => {
  const exposers: Record<string, string[]> = {
    REPO_CREATION_FORBIDDEN: ["repo.createSpec"],
    USER_TOKEN_REQUIRED: ["repo.createSpec"],
    PROVIDER_AUTH_EXPIRED: PROVIDER_ROUTES,
    PROVIDER_RATE_LIMITED: PROVIDER_ROUTES,
    PROVIDER_UNAVAILABLE: PROVIDER_ROUTES,
    SPEC_BATCH_CONFLICT: ["specBatch.submit"],
    SPEC_INVALID: ["specBatch.submit"],
    SPEC_INDEX_FAILED: ["spec.listFeatures", "spec.getFeature"],
  };
  it.each(Object.entries(exposers))("%s n'apparaît que sur ses routes", (code, routes) => {
    for (const name of EVERY) {
      expect(errors(name)[code] !== undefined, `${name} ${code}`).toBe(routes.includes(name));
    }
  });
  it("les listes et spec.head ne parlent jamais au fournisseur", () => {
    for (const name of [
      "installation.list",
      "repo.list",
      "spec.head",
      "spec.listFeatures",
      "specBatch.get",
    ]) {
      for (const code of [
        "PROVIDER_AUTH_EXPIRED",
        "PROVIDER_RATE_LIMITED",
        "PROVIDER_UNAVAILABLE",
      ]) {
        expect(errors(name)[code], `${name} ${code}`).toBeUndefined();
      }
    }
  });
  it("les routes historiques n'exposent aucune erreur fournisseur ni de lot", () => {
    for (const name of OLD_ROUTES) {
      for (const code of Object.keys(exposers))
        expect(errors(name)[code], `${name} ${code}`).toBeUndefined();
    }
  });
});

describe("X10 déclarateurs exportés et errorStatusMap", () => {
  it("chaque erreur a son déclarateur dans l'index", () => {
    expect(api.repoCreationForbiddenError.REPO_CREATION_FORBIDDEN.status).toBe(403);
    expect(api.userTokenRequiredError.USER_TOKEN_REQUIRED.status).toBe(403);
    expect(api.providerAuthExpiredError.PROVIDER_AUTH_EXPIRED.status).toBe(403);
    expect(api.providerRateLimitedError.PROVIDER_RATE_LIMITED.status).toBe(429);
    expect(api.providerUnavailableError.PROVIDER_UNAVAILABLE.status).toBe(503);
    expect(api.specBatchConflictError.SPEC_BATCH_CONFLICT.status).toBe(409);
    expect(api.specInvalidError.SPEC_INVALID.status).toBe(422);
  });
  it("errorStatusMap contient les 7 codes", () => {
    const map = api.errorStatusMap as Record<string, number>;
    expect(map.REPO_CREATION_FORBIDDEN).toBe(403);
    expect(map.USER_TOKEN_REQUIRED).toBe(403);
    expect(map.PROVIDER_AUTH_EXPIRED).toBe(403);
    expect(map.PROVIDER_RATE_LIMITED).toBe(429);
    expect(map.PROVIDER_UNAVAILABLE).toBe(503);
    expect(map.SPEC_BATCH_CONFLICT).toBe(409);
    expect(map.SPEC_INVALID).toBe(422);
  });
});

describe("X11 OpenAPI : réponses d'erreur des nouvelles routes", () => {
  type Doc = {
    paths: Record<string, Record<string, { responses: Record<string, unknown> }>>;
    components?: { schemas?: Record<string, unknown> };
  };
  const statuses = (d: Doc, path: string, method: string) =>
    Object.keys(d.paths[path]?.[method]?.responses ?? {});
  const EXPECTED: [string, string, string[]][] = [
    ["/provider/installations", "get", ["401", "403", "500"]],
    ["/provider/installations/start", "post", ["401", "403", "404", "500"]],
    ["/projects/{projectId}/repos", "get", ["401", "403", "404", "500"]],
    [
      "/projects/{projectId}/repos",
      "post",
      ["401", "403", "404", "409", "422", "429", "503", "500"],
    ],
    [
      "/projects/{projectId}/spec-repo",
      "post",
      ["401", "403", "404", "409", "422", "429", "503", "500"],
    ],
    ["/projects/{projectId}/spec", "get", ["401", "404", "422", "500"]],
    ["/projects/{projectId}/spec/features", "get", ["401", "404", "409", "422", "500"]],
    [
      "/projects/{projectId}/spec/features/{specId}",
      "get",
      ["401", "403", "404", "409", "429", "503", "500"],
    ],
    [
      "/projects/{projectId}/spec/batches",
      "post",
      ["401", "403", "404", "409", "422", "429", "503", "500"],
    ],
    ["/projects/{projectId}/spec/batches/{batchId}", "get", ["401", "403", "404", "500"]],
  ];
  it.each(EXPECTED)("%s %s expose ses réponses", async (path, method, codes) => {
    const d = (await generateOpenApi()) as Doc;
    expect(statuses(d, path, method)).toEqual(expect.arrayContaining(codes));
  });
});

describe("X11b OpenAPI : absences et composants", () => {
  type Doc = {
    paths: Record<string, Record<string, { responses: Record<string, unknown> }>>;
    components?: { schemas?: Record<string, unknown> };
  };
  const statuses = (d: Doc, path: string, method: string) =>
    Object.keys(d.paths[path]?.[method]?.responses ?? {});
  it("les lectures de spec n'ont pas de 403 propre (hors getFeature, fournisseur)", async () => {
    const d = (await generateOpenApi()) as Doc;
    expect(statuses(d, "/projects/{projectId}/spec", "get")).not.toContain("403");
    expect(statuses(d, "/projects/{projectId}/spec/features", "get")).not.toContain("403");
  });
  it("les listes et specBatch.get n'ont ni 429 ni 503", async () => {
    const d = (await generateOpenApi()) as Doc;
    for (const [path, method] of [
      ["/provider/installations", "get"],
      ["/projects/{projectId}/repos", "get"],
      ["/projects/{projectId}/spec", "get"],
      ["/projects/{projectId}/spec/features", "get"],
      ["/projects/{projectId}/spec/batches/{batchId}", "get"],
    ] as const) {
      expect(statuses(d, path, method), `${method} ${path}`).not.toContain("429");
      expect(statuses(d, path, method), `${method} ${path}`).not.toContain("503");
    }
  });
  it("les composants des nouvelles erreurs sont publiés", async () => {
    const schemas = Object.keys(((await generateOpenApi()) as Doc).components?.schemas ?? {});
    for (const name of [
      "RepoCreationForbidden",
      "UserTokenRequired",
      "ProviderAuthExpired",
      "ProviderRateLimited",
      "ProviderUnavailable",
      "SpecBatchConflict",
      "SpecInvalid",
      "SpecIndexFailed",
    ]) {
      expect(schemas, name).toContain(name);
    }
  });
});

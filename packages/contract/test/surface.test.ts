import { describe, expect, expectTypeOf, it } from "vitest";
import * as api from "../src/index.ts";
import { contract, generateOpenApi } from "../src/index.ts";

type Doc = {
  paths: Record<string, Record<string, { responses: Record<string, unknown> }>>;
  components?: { schemas?: Record<string, unknown> };
};
const doc = async () => (await generateOpenApi()) as Doc;
const statuses = (d: Doc, path: string, method: string) =>
  Object.keys(d.paths[path]?.[method]?.responses ?? {});

const GROUPS: Record<string, string[]> = {
  ticket: ["create", "delete", "get", "list", "transition", "update"],
  dependency: ["add", "list", "remove"],
  sprint: ["activate", "close", "create", "get", "list", "update"],
  comment: ["create", "delete", "list"],
  projectState: ["get", "update"],
  lease: ["acquire", "get", "heartbeat", "release"],
  audit: ["list"],
  installation: ["list", "start"],
  llmCredential: ["invalidate", "list", "remove", "set", "verify"],
  ai: ["draftBrief", "proposeCriteria", "proposeFeatures"],
  aiProvider: ["add", "list", "remove", "replaceKey", "setPrimary", "verify"],
  aiModel: ["listQualified"],
  aiUsage: ["report", "set"],
  aiSettings: ["get", "update"],
  projectClient: ["add", "list", "remove"],
  clientSpace: ["feature", "features", "projects"],
  repo: ["createSpec", "link", "list"],
  spec: ["getFeature", "head", "listFeatures"],
  review: ["list", "submit"],
  specBatch: ["get", "submit"],
  suggestion: ["accept", "create", "list", "reject", "withdraw"],
  project: ["create", "list", "recent", "shell", "visit"],
  search: ["query"],
  org: ["get", "update"],
  invitation: ["create", "list", "resend", "revoke"],
  me: ["get", "getNotifications", "update", "updateNotification"],
};

describe("R1 routeur : 22 groupes (TK-42 : +4, TK-52b : +1, TK-54b : +1, TK-55a : +1, TK-55b : +1, TK-55c : +1, TK-55d : +1, TK-88 : +1), 60 procédures", () => {
  it("expose health, organization, member, project, les 7 groupes de TK-29 et les 4 de TK-42", () => {
    expect(Object.keys(contract).sort()).toEqual(
      [
        "ai",
        "aiModel",
        "aiProvider",
        "aiSettings",
        "aiUsage",
        "audit",
        "clientSpace",
        "comment",
        "dependency",
        "health",
        "installation",
        "invitation",
        "lease",
        "llmCredential",
        "me",
        "member",
        "org",
        "organization",
        "project",
        "projectClient",
        "projectState",
        "repo",
        "review",
        "search",
        "spec",
        "specBatch",
        "sprint",
        "suggestion",
        "ticket",
      ].sort(),
    );
  });
  it.each(Object.entries(GROUPS))("le groupe %s contient exactement ses procédures", (g, names) => {
    const group = (contract as unknown as Record<string, Record<string, unknown>>)[g] ?? {};
    expect(Object.keys(group).sort()).toEqual(names);
  });
  it("aucune procédure d'écriture de l'audit ni de verrou (lock.*)", () => {
    expect("lock" in contract).toBe(false);
  });
});

const AI_PAIRS = [
  "POST /projects/{projectId}/ai/brief",
  "POST /projects/{projectId}/ai/features",
  "POST /projects/{projectId}/ai/criteria",
  "POST /llm-credentials/{provider}/verify",
];

const SUGGESTION_PAIRS = [
  "GET /projects/{projectId}/suggestions",
  "POST /projects/{projectId}/suggestions",
  "POST /projects/{projectId}/suggestions/{id}/withdraw",
  "POST /projects/{projectId}/suggestions/{id}/accept",
  "POST /projects/{projectId}/suggestions/{id}/reject",
];

const REVIEW_PAIRS = ["GET /projects/{projectId}/reviews", "POST /projects/{projectId}/reviews"];

const CLIENT_SPACE_PAIRS = [
  "GET /client-space/projects",
  "GET /client-space/projects/{projectId}/features",
  "GET /client-space/projects/{projectId}/features/{featureId}",
];
const PROJECT_CLIENT_PAIRS = [
  "GET /projects/{projectId}/clients",
  "POST /projects/{projectId}/clients",
  "DELETE /projects/{projectId}/clients/{memberId}",
];
const LLM_PAIRS = [
  "GET /llm-credentials",
  "PUT /llm-credentials/{provider}",
  "DELETE /llm-credentials/{provider}",
  "POST /llm-credentials/{provider}/invalidate",
];

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: tableau des paires de routes attendues
describe("R2 OpenAPI : méthode et chemin de chaque nouvelle procédure", () => {
  const PAIRS = [
    "POST /projects/{projectId}/tickets",
    "GET /projects/{projectId}/tickets/{key}",
    "GET /projects/{projectId}/tickets",
    "PATCH /projects/{projectId}/tickets/{key}",
    "DELETE /projects/{projectId}/tickets/{key}",
    "POST /projects/{projectId}/tickets/{key}/transition",
    "POST /projects/{projectId}/tickets/{key}/dependencies",
    "DELETE /projects/{projectId}/tickets/{key}/dependencies/{dependsOn}",
    "GET /projects/{projectId}/tickets/{key}/dependencies",
    "POST /projects/{projectId}/sprints",
    "GET /projects/{projectId}/sprints/{key}",
    "GET /projects/{projectId}/sprints",
    "PATCH /projects/{projectId}/sprints/{key}",
    "POST /projects/{projectId}/sprints/{key}/activate",
    "POST /projects/{projectId}/sprints/{key}/close",
    "POST /projects/{projectId}/comments",
    "GET /projects/{projectId}/comments",
    "DELETE /projects/{projectId}/comments/{id}",
    "GET /projects/{projectId}/project-state",
    "PUT /projects/{projectId}/project-state",
    "POST /projects/{projectId}/tickets/{key}/lease",
    "POST /projects/{projectId}/tickets/{key}/lease/heartbeat",
    "DELETE /projects/{projectId}/tickets/{key}/lease",
    "GET /projects/{projectId}/tickets/{key}/lease",
    "GET /projects/{projectId}/audit",
  ];
  const NEW_PAIRS = [
    "GET /provider/installations",
    "POST /provider/installations/start",
    "GET /projects/{projectId}/repos",
    "POST /projects/{projectId}/repos",
    "POST /projects/{projectId}/spec-repo",
    "GET /projects/{projectId}/spec",
    "GET /projects/{projectId}/spec/features",
    "GET /projects/{projectId}/spec/features/{specId}",
    "POST /projects/{projectId}/spec/batches",
    "GET /projects/{projectId}/spec/batches/{batchId}",
  ];
  const SETTINGS_PAIRS = [
    "GET /organization",
    "PATCH /organization",
    "POST /invitations",
    "GET /invitations",
    "POST /invitations/{invitationId}/resend",
    "DELETE /invitations/{invitationId}",
    "GET /members/page",
    "PATCH /members/{memberId}",
    "DELETE /members/{memberId}",
    "GET /me",
    "PATCH /me",
    "GET /me/notifications",
    "PUT /me/notifications/{key}",
  ];
  const AI_PROVIDER_PAIRS = [
    "GET /ai/providers",
    "POST /ai/providers",
    "POST /ai/providers/{provider}/verify",
    "PUT /ai/providers/{provider}/key",
    "DELETE /ai/providers/{provider}",
    "POST /ai/providers/{provider}/primary",
    "GET /ai/models",
    "PUT /ai/usages/{usage}",
    "GET /ai/usage",
    "GET /ai/settings",
    "PATCH /ai/settings",
  ];
  const SHELL_PAIRS = [
    "GET /projects/{projectId}/shell",
    "POST /projects/{projectId}/visit",
    "GET /project-visits",
    "GET /search",
  ];
  it("les 25 paires de TK-29, les 10 de TK-42, les 4 de TK-52b, les 4 de TK-54b et les 3 de TK-55a les 3 de TK-55b les 5 de TK-55c les 2 de TK-55d les 4 de TK-88 les 13 de TK-97 et les 11 de TK-98 sont présentes (92 routes)", async () => {
    const d = await doc();
    const pairs = Object.entries(d.paths).flatMap(([p, ops]) =>
      Object.keys(ops).map((m) => `${m.toUpperCase()} ${p}`),
    );
    const expected = [
      ...PAIRS,
      ...NEW_PAIRS,
      ...LLM_PAIRS,
      ...AI_PAIRS,
      ...PROJECT_CLIENT_PAIRS,
      ...CLIENT_SPACE_PAIRS,
      ...SUGGESTION_PAIRS,
      ...REVIEW_PAIRS,
      ...SHELL_PAIRS,
      ...SETTINGS_PAIRS,
      ...AI_PROVIDER_PAIRS,
    ];
    for (const pair of expected) expect(pairs, pair).toContain(pair);
    expect(pairs).toHaveLength(8 + expected.length);
    expect(pairs).toHaveLength(92);
  });
});

describe("R3 OpenAPI : réponses d'erreur par route", () => {
  const EXPECTED: [string, string, string[]][] = [
    ["/projects/{projectId}/tickets", "post", ["401", "403", "404", "422", "500"]],
    ["/projects/{projectId}/tickets/{key}", "get", ["401", "404", "500"]],
    ["/projects/{projectId}/tickets", "get", ["401", "500"]],
    ["/projects/{projectId}/tickets/{key}", "patch", ["401", "403", "404", "422", "500"]],
    ["/projects/{projectId}/tickets/{key}", "delete", ["401", "403", "404", "409", "500"]],
    ["/projects/{projectId}/tickets/{key}/transition", "post", ["401", "403", "404", "409", "500"]],
    [
      "/projects/{projectId}/tickets/{key}/dependencies",
      "post",
      ["401", "403", "404", "409", "500"],
    ],
    ["/projects/{projectId}/sprints", "post", ["401", "403", "404", "422", "500"]],
    ["/projects/{projectId}/sprints/{key}/activate", "post", ["401", "403", "404", "409", "500"]],
    ["/projects/{projectId}/project-state", "put", ["401", "403", "404", "409", "500"]],
    ["/projects/{projectId}/tickets/{key}/lease", "post", ["401", "403", "404", "409", "500"]],
    ["/projects/{projectId}/tickets/{key}/lease/heartbeat", "post", ["403", "404", "409", "500"]],
    ["/projects/{projectId}/tickets/{key}/lease", "delete", ["403", "404", "500"]],
    ["/projects/{projectId}/audit", "get", ["401", "403", "404", "500"]],
  ];
  it.each(EXPECTED)("%s %s expose ses réponses", async (path, method, codes) => {
    expect(statuses(await doc(), path, method)).toEqual(expect.arrayContaining(codes));
  });
  it("les lectures ouvertes à tous n'ont pas de 403", async () => {
    const d = await doc();
    expect(statuses(d, "/projects/{projectId}/tickets", "get")).not.toContain("403");
    expect(statuses(d, "/projects/{projectId}/sprints", "get")).not.toContain("403");
  });
});

describe("R4 OpenAPI : composants des erreurs typées", () => {
  it("contient InvalidTransition, DependencyCycle, VersionConflict, LeaseHeld, LeaseExpired, LeaseNotHolder, Validation", async () => {
    const schemas = (await doc()).components?.schemas ?? {};
    for (const name of [
      "InvalidTransition",
      "DependencyCycle",
      "VersionConflict",
      "LeaseHeld",
      "LeaseExpired",
      "LeaseNotHolder",
      "Validation",
    ]) {
      expect(Object.keys(schemas), name).toContain(name);
    }
  });
  it("errorStatusMap couvre les nouveaux codes", () => {
    const map = api.errorStatusMap as Record<string, number>;
    expect(map.INVALID_TRANSITION).toBe(409);
    expect(map.DEPENDENCY_CYCLE).toBe(409);
    expect(map.VERSION_CONFLICT).toBe(409);
    expect(map.LEASE_HELD).toBe(409);
    expect(map.LEASE_EXPIRED).toBe(409);
    expect(map.LEASE_NOT_HOLDER).toBe(403);
    expect(map.VALIDATION).toBe(422);
  });
});

describe("R5 index : schémas et types exportés", () => {
  it("ré-exporte les schémas de l'index", () => {
    for (const name of [
      "ticketSchema",
      "ticketDetailSchema",
      "ticketStatusSchema",
      "ticketKeySchema",
      "sprintSchema",
      "dependencySchema",
      "commentSchema",
      "projectStateSchema",
      "leaseSchema",
      "auditEntrySchema",
      "ticketPackageSchema",
      "sensitivitySchema",
      "dependencyTypeSchema",
    ]) {
      expect((api as Record<string, unknown>)[name], name).toBeDefined();
    }
  });
  it("types d'entrée, de sortie et d'énumération", () => {
    expectTypeOf<api.TicketCreateInput>().toHaveProperty("title");
    expectTypeOf<api.TicketTransitionInput>().toEqualTypeOf<{
      projectId: string;
      key: string;
      to: api.TicketStatus;
    }>();
    expectTypeOf<api.TicketOutput>().toHaveProperty("key");
    expectTypeOf<api.DependencyAddInput>().toHaveProperty("dependsOn");
    expectTypeOf<api.SprintCreateInput>().toHaveProperty("goal");
    expectTypeOf<api.CommentCreateInput>().toHaveProperty("body");
    expectTypeOf<api.ProjectStateUpdateInput>().toHaveProperty("expectedVersion");
    expectTypeOf<api.LeaseAcquireInput>().toHaveProperty("worktree");
    expectTypeOf<api.AuditEntry>().toHaveProperty("occurredAt");
    expectTypeOf<api.TicketStatus>().toEqualTypeOf<
      "backlog" | "todo" | "in_progress" | "in_review" | "blocked" | "done" | "cancelled"
    >();
  });
});

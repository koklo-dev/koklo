import {
  GitAuthExpiredError,
  GitConflictError,
  GitNotFoundError,
  GitProviderError,
  GitProviderUnavailableError,
  GitRateLimitedError,
  RepoCreationForbiddenError,
  UserTokenRequiredError,
} from "@koklo/domain";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { auditRowsFull } from "./helpers/comments.ts";
import { installBench, scene } from "./helpers/repo-scene.ts";
import { insertInstallation, projectRepoRows } from "./helpers/repos.ts";

/**
 * TK-43 CA8 : toutes les erreurs du port deviennent les erreurs typées du contrat, par `instanceof`
 * (jamais `error.name`, énumérable et falsifiable), sans ligne ni audit, sans message du fournisseur.
 */
const bench = installBench({ beforeAll, afterAll, beforeEach });
const RAW = "MESSAGE-BRUT-DU-FOURNISSEUR jeton=fake-installation-secret";

interface Case {
  label: string;
  step: string;
  error: (login: string) => Error;
  status: number;
  code: string;
  data?: (login: string) => unknown;
}

const op = (step: string) => ({ operation: step });
const org = (login: string) => ({ kind: "organization", login }) as const;

const CASES: Case[] = [
  {
    label: "UserTokenRequiredError",
    step: "createRepo",
    error: (login) => new UserTokenRequiredError({ ...op("createRepo"), owner: org(login) }),
    status: 403,
    code: "USER_TOKEN_REQUIRED",
    data: (login) => ({ ownerLogin: login }),
  },
  ...(["missing-user-token", "resource-not-accessible"] as const).map((reason) => ({
    label: `RepoCreationForbiddenError ${reason}`,
    step: "createRepo",
    error: (login: string) =>
      new RepoCreationForbiddenError({ ...op("createRepo"), owner: org(login), reason }),
    status: 403,
    code: "REPO_CREATION_FORBIDDEN",
    data: (login: string) => ({ reason, ownerLogin: login, ownerKind: "organization" }),
  })),
  {
    label: "GitConflictError exists (createRepo)",
    step: "createRepo",
    error: () => new GitConflictError({ ...op("createRepo"), reason: "exists", identifier: "x/y" }),
    status: 409,
    code: "CONFLICT",
    data: () => ({ reason: "repo_name_taken" }),
  },
  {
    label: "GitNotFoundError (anomalie sur un repo neuf)",
    step: "writeCommit",
    error: () =>
      new GitNotFoundError({ ...op("writeCommit"), resource: "branch", identifier: RAW }),
    status: 500,
    code: "INTERNAL",
  },
  {
    label: "GitConflictError stale-sha (anomalie)",
    step: "writeCommit",
    error: () =>
      new GitConflictError({ ...op("writeCommit"), reason: "stale-sha", identifier: RAW }),
    status: 500,
    code: "INTERNAL",
  },
  {
    label: "GitConflictError exists sur la branche cadrage (anomalie)",
    step: "createBranch",
    error: () => new GitConflictError({ ...op("createBranch"), reason: "exists", identifier: RAW }),
    status: 500,
    code: "INTERNAL",
  },
  {
    label: "GitProviderError générique",
    step: "createRepo",
    error: () => new GitProviderError("createRepo", RAW),
    status: 500,
    code: "INTERNAL",
  },
  {
    label: "Error inconnue",
    step: "createRepo",
    error: () => new Error(RAW),
    status: 500,
    code: "INTERNAL",
  },
  {
    label: "Error qui usurpe le nom GitRateLimitedError (pas d'aiguillage par name)",
    step: "createRepo",
    error: () => Object.assign(new Error(RAW), { name: "GitRateLimitedError" }),
    status: 500,
    code: "INTERNAL",
  },
];

/** Les erreurs de transport/autorisation sont mappées de la même façon à chaque étape réseau. */
const EVERY_STEP = ["authenticate", "createRepo", "writeCommit", "createBranch"];
const TRANSPORT: Omit<Case, "step">[] = [
  {
    label: "GitAuthExpiredError installation non rafraîchissable",
    error: () => new GitAuthExpiredError({ ...op("x"), kind: "installation", refreshable: false }),
    status: 403,
    code: "PROVIDER_AUTH_EXPIRED",
    data: () => ({ kind: "installation", refreshable: false }),
  },
  {
    label: "GitAuthExpiredError user rafraîchissable",
    error: () => new GitAuthExpiredError({ ...op("x"), kind: "user", refreshable: true }),
    status: 403,
    code: "PROVIDER_AUTH_EXPIRED",
    data: () => ({ kind: "user", refreshable: true }),
  },
  {
    label: "GitRateLimitedError avec délai",
    error: () => new GitRateLimitedError({ ...op("x"), retryAfterMs: 12_000 }),
    status: 429,
    code: "PROVIDER_RATE_LIMITED",
    data: () => ({ retryAfterMs: 12_000 }),
  },
  {
    label: "GitRateLimitedError sans délai",
    error: () => new GitRateLimitedError({ ...op("x"), retryAfterMs: undefined }),
    status: 429,
    code: "PROVIDER_RATE_LIMITED",
    data: () => ({}),
  },
  {
    label: "GitProviderUnavailableError",
    error: () => new GitProviderUnavailableError(op("x")),
    status: 503,
    code: "PROVIDER_UNAVAILABLE",
  },
];

const ALL: Case[] = [
  ...CASES,
  ...EVERY_STEP.flatMap((step) => TRANSPORT.map((c) => ({ ...c, step }))),
];

describe("CA8 mappage des erreurs du port vers le contrat (repo.createSpec)", () => {
  it.each(ALL)("$label à $step : $status $code", async (c) => {
    const b = bench();
    const { world, installation, api } = await scene(b);
    b.harness.failWith(c.step, c.error(installation.ownerLogin));

    const res = await api.createSpec(world.projectId, installation.id);

    expect(res.status, JSON.stringify(res.body)).toBe(c.status);
    expect(res.body.code).toBe(c.code);
    if (c.data) expect(res.body.data ?? {}).toEqual(c.data(installation.ownerLogin));
    expect(JSON.stringify(res.body)).not.toContain("MESSAGE-BRUT");
    expect(JSON.stringify(res.body)).not.toContain("fake-installation");
    expect(await projectRepoRows(b.database, world.organizationId)).toEqual([]);
    const audit = await auditRowsFull(b.database, world.organizationId);
    expect(audit.filter((e) => e.action === "repo.createSpec")).toEqual([]);
  });
});

async function personal() {
  const b = bench();
  const base = await scene(b);
  const installation = await insertInstallation(b.database, base.world.organizationId, {
    ownerKind: "user",
    ownerLogin: `octo-${base.installation.ownerLogin}`,
  });
  return { b, ...base, installation };
}

const validUntil = (ms: number, extra: Record<string, string> = {}) => ({
  token: "uat-secret-valid",
  expiresAt: new Date(Date.parse(bench().clock.now()) + ms).toISOString(),
  ...extra,
});

describe("CA8 compte personnel (ADR 0009) : sans jeton utilisateur exploitable", () => {
  it("sans identifiants : USER_TOKEN_REQUIRED{ownerLogin}, aucun repo, aucune ligne", async () => {
    const { b, world, installation, api } = await personal();
    const res = await api.createSpec(world.projectId, installation.id);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("USER_TOKEN_REQUIRED");
    expect(res.body.data).toEqual({ ownerLogin: installation.ownerLogin });
    expect(b.harness.names()).not.toContain("writeCommit");
    expect(await projectRepoRows(b.database, world.organizationId)).toEqual([]);
  });

  it("jeton expiré non rafraîchissable : PROVIDER_AUTH_EXPIRED{kind: user, refreshable: false}", async () => {
    const { b, world, installation, api } = await personal();
    b.credentials.set(world.actors.owner.userId, installation.id, validUntil(-1000));
    const res = await api.createSpec(world.projectId, installation.id);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("PROVIDER_AUTH_EXPIRED");
    expect(res.body.data).toEqual({ kind: "user", refreshable: false });
    expect(await projectRepoRows(b.database, world.organizationId)).toEqual([]);
  });

  it("les identifiants d'un autre utilisateur ne servent pas", async () => {
    const { b, world, installation, api } = await personal();
    b.credentials.set(world.actors.admin.userId, installation.id, validUntil(3_600_000));
    const res = await api.createSpec(world.projectId, installation.id);
    expect(res.body.code).toBe("USER_TOKEN_REQUIRED");
  });
});

describe("CA8 compte personnel : avec jeton utilisateur", () => {
  it("identifiants valides : createRepo avec le jeton utilisateur, commit et branche avec l'installation", async () => {
    const { b, world, installation, api } = await personal();
    b.credentials.set(world.actors.owner.userId, installation.id, validUntil(3_600_000));

    const res = await api.createSpec(world.projectId, installation.id);

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(b.harness.callsOf("authenticate")[0]?.request.user).toMatchObject({
      token: "uat-secret-valid",
    });
    const kind = (method: string) =>
      (b.harness.callsOf(method)[0]?.request.auth as { kind: string } | undefined)?.kind;
    expect([kind("createRepo"), kind("writeCommit"), kind("createBranch")]).toEqual([
      "user",
      "installation",
      "installation",
    ]);
    expect(b.harness.callsOf("createRepo")[0]?.request.owner).toEqual({
      kind: "user",
      login: installation.ownerLogin,
    });
    expect(await projectRepoRows(b.database, world.organizationId)).toHaveLength(1);
  });

  it("jeton expiré mais rafraîchissable : le jeton renouvelé est enregistré dans le magasin", async () => {
    const { b, world, installation, api } = await personal();
    const refreshExpiresAt = validUntil(86_400_000).expiresAt;
    b.credentials.set(
      world.actors.owner.userId,
      installation.id,
      validUntil(-1000, { refreshToken: "rt-secret", refreshExpiresAt }),
    );

    const res = await api.createSpec(world.projectId, installation.id);

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(b.credentials.saved).toHaveLength(1);
    expect(b.credentials.saved[0]).toMatchObject({
      userId: world.actors.owner.userId,
      installationId: installation.id,
    });
    expect(b.credentials.saved[0]?.credentials.token).toMatch(/^fake-user-/);
  });
});

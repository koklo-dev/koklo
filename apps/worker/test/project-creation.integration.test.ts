import {
  GitAuthExpiredError,
  GitConflictError,
  GitNotFoundError,
  GitProviderError,
  GitProviderUnavailableError,
  GitRateLimitedError,
  RepoCreationForbiddenError,
} from "@koklo/domain";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type CreationOptions,
  creationRow,
  enqueueCreation,
  KEYRING,
  repoRows,
  seedCreation,
  settledCreation,
} from "./support/project-creation-bench.ts";
import { WorkerBench } from "./support/spec-write-bench.ts";

/**
 * TK-93 lot A (cas 6) : le job `project-creation` (pg-boss réel, Postgres éphémère, faux fournisseur
 * espionné) crée le dépôt de spec, le relie au projet et règle la ligne `project_creations`. Chaque
 * code d'échec, la relance transitoire, le dépôt déjà relié et le jeton utilisateur sont couverts.
 */
let bench: WorkerBench;

beforeAll(async () => {
  bench = await WorkerBench.create();
  await bench.start({ projectCreation: { retryLimit: 1, retryDelaySeconds: 1 } } as never, {
    encryptionKeyring: KEYRING,
  });
}, 240_000);
afterAll(async () => {
  await bench?.dispose();
});
beforeEach(() => {
  bench.spy.reset();
});

async function run(options: CreationOptions = {}) {
  const scene = await seedCreation(bench, options);
  await enqueueCreation(bench, scene);
  const row = await settledCreation(bench, scene.creationId);
  return { scene, row };
}

describe("TK-93 project-creation : succès", () => {
  it("crée le dépôt privé, relie le dépôt au projet, journalise, règle en succeeded", async () => {
    const { scene, row } = await run();
    expect(row).toMatchObject({ status: "succeeded", error_code: null });
    expect(
      bench.spy.calls.map((call) => call.method).filter((method) => method !== "authenticate"),
    ).toEqual(["createRepo", "writeCommit", "createBranch"]);
    const [create] = bench.spy.callsOf("createRepo");
    expect(create?.request).toMatchObject({
      name: "refonte-du-portail-spec",
      visibility: "private",
      owner: scene.owner,
    });
    expect(await repoRows(bench, scene.projectId)).toEqual([
      {
        role: "spec",
        mode: "new",
        name: "refonte-du-portail-spec",
        owner_login: scene.owner.login,
      },
    ]);
    const audit = await bench.query<{ action: string; actor_id: string }>(
      "SELECT action, actor_id FROM audit_log WHERE project_id = $1",
      [scene.projectId],
    );
    expect(audit).toEqual([{ action: "repo.createSpec", actor_id: scene.userId }]);
  });

  it("la charge du job ne porte que l'identifiant de la création, aucun secret", async () => {
    const { scene } = await run();
    const job = await bench.worker?.boss.getJobById("project-creation", scene.creationId);
    expect(job?.data).toEqual({ creationId: scene.creationId });
  });

  it("dépôt déjà relié au projet : succeeded sans aucun appel au fournisseur", async () => {
    const scene = await seedCreation(bench);
    await bench.query(
      `INSERT INTO project_repos (id, organization_id, project_id, installation_id, role, mode, external_id, owner_login, name, default_branch, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, 'spec', 'new', 'ext-1', $4, 'deja-la', 'main', now(), now())`,
      [scene.organizationId, scene.projectId, scene.installationId, scene.owner.login],
    );
    await enqueueCreation(bench, scene);
    const row = await settledCreation(bench, scene.creationId);
    expect(row.status).toBe("succeeded");
    expect(bench.spy.calls).toEqual([]);
  });

  it("sans compte GitHub choisi : skipped no_account, aucun appel au fournisseur", async () => {
    const { row } = await run({ withInstallation: false });
    expect(row).toMatchObject({ status: "skipped", error_code: "no_account" });
    expect(bench.spy.calls).toEqual([]);
  });
});

describe("TK-93 project-creation : cas sans effet", () => {
  it("une création déjà réglée n'est pas rejouée", async () => {
    const scene = await seedCreation(bench, { status: "succeeded" });
    await enqueueCreation(bench, scene);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    expect(bench.spy.callsOf("createRepo")).toEqual([]);
    expect((await creationRow(bench, scene.creationId)).status).toBe("succeeded");
  });

  it("un job au payload invalide est ignoré sans effet", async () => {
    await bench.worker?.boss.send(
      "project-creation",
      { creationId: "pas-un-uuid" },
      { singletonKey: "invalide-1" },
    );
    await bench.worker?.boss.send("project-creation", {}, { singletonKey: "invalide-2" });
    await new Promise((resolve) => setTimeout(resolve, 1500));
    expect(bench.spy.calls).toEqual([]);
  });
});

const PERSONAL = { ownerKind: "user" } as const;
const FAILURES: [string, CreationOptions, () => void, Record<string, unknown>][] = [
  [
    "name_taken",
    {},
    () =>
      bench.spy.failWith(
        "createRepo",
        new GitConflictError({ operation: "createRepo", reason: "exists", identifier: "x" }),
      ),
    { error_code: "name_taken" },
  ],
  [
    "user_token_required (compte personnel sans jeton)",
    PERSONAL,
    () => undefined,
    { error_code: "user_token_required" },
  ],
  [
    "auth_expired_user (jeton utilisateur périmé, sans rafraîchissement)",
    {
      ...PERSONAL,
      userCredentials: { token: "jeton-test", expiresAt: "2020-01-01T00:00:00.000Z" },
    },
    () => undefined,
    { error_code: "auth_expired_user" },
  ],
  [
    "auth_expired_installation",
    {},
    () =>
      bench.spy.failWith(
        "authenticate",
        new GitAuthExpiredError({
          operation: "authenticate",
          kind: "installation",
          refreshable: false,
        }),
      ),
    { error_code: "auth_expired_installation" },
  ],
  [
    "resource_not_accessible",
    {},
    () =>
      bench.spy.failWith(
        "createRepo",
        new RepoCreationForbiddenError({
          operation: "createRepo",
          owner: { kind: "organization", login: "x" },
          reason: "resource-not-accessible",
        }),
      ),
    { error_code: "resource_not_accessible" },
  ],
  [
    "provider_unavailable (panne persistante : relancée puis définitive)",
    {},
    () =>
      bench.spy.failWith(
        "createRepo",
        new GitProviderUnavailableError({ operation: "createRepo" }),
      ),
    { error_code: "provider_unavailable" },
  ],
  [
    "rate_limited (délai conservé)",
    {},
    () =>
      bench.spy.failWith(
        "createRepo",
        new GitRateLimitedError({ operation: "createRepo", retryAfterMs: 4000 }),
      ),
    { error_code: "rate_limited", retry_after_ms: 4000 },
  ],
  [
    "account_unavailable (installation suspendue)",
    { installationStatus: "suspended" },
    () => undefined,
    { error_code: "account_unavailable" },
  ],
  [
    "account_unavailable (installation introuvable chez le fournisseur)",
    {},
    () =>
      bench.spy.failWith(
        "authenticate",
        new GitNotFoundError({
          operation: "authenticate",
          resource: "installation",
          identifier: "1",
        }),
      ),
    { error_code: "account_unavailable" },
  ],
  ["invalid_name", { repoName: ".." }, () => undefined, { error_code: "invalid_name" }],
  [
    "forbidden (403 du fournisseur)",
    {},
    () =>
      bench.spy.failWith(
        "createRepo",
        new GitProviderError("createRepo", undefined, { status: 403 }),
      ),
    { error_code: "forbidden" },
  ],
  [
    "unknown",
    {},
    () => bench.spy.failWith("createRepo", new Error("boom")),
    { error_code: "unknown" },
  ],
];

describe("TK-93 project-creation : les codes d'échec", () => {
  it.each(FAILURES)(
    "%s",
    async (_label, options, arrange, expected) => {
      arrange();
      const { scene, row } = await run(options);
      expect(row).toMatchObject({ status: "failed", ...expected });
      expect(await repoRows(bench, scene.projectId)).toEqual([]);
    },
    60_000,
  );

  it("un échec ne laisse aucun secret ni message brut dans la ligne", async () => {
    bench.spy.failWith("createRepo", new Error("ghs_SECRET_TOKEN_VALUE_0123456789"));
    const { row } = await run();
    expect(JSON.stringify(row)).not.toContain("ghs_");
  });
});

describe("TK-93 project-creation : reprises", () => {
  it("panne transitoire puis succès : relancée par pg-boss, un seul dépôt, succeeded", async () => {
    bench.spy.failWith(
      "createRepo",
      new GitProviderUnavailableError({ operation: "createRepo" }),
      1,
    );
    const { scene, row } = await run();
    expect(row.status).toBe("succeeded");
    expect(bench.spy.callsOf("createRepo")).toHaveLength(2);
    expect(await repoRows(bench, scene.projectId)).toHaveLength(1);
  }, 60_000);

  it("compte personnel avec jeton utilisateur valide : le dépôt est créé avec ce jeton", async () => {
    const future = new Date(Date.now() + 3_600_000).toISOString();
    const { row } = await run({
      ...PERSONAL,
      userCredentials: { token: "jeton-utilisateur-test", expiresAt: future },
    });
    expect(row.status).toBe("succeeded");
    const authKind = (method: string) =>
      (bench.spy.callsOf(method)[0]?.request.auth as { kind: string } | undefined)?.kind;
    expect(authKind("createRepo")).toBe("user");
    expect(authKind("writeCommit")).toBe("installation");
  });

  it("une création `failed` relancée (même ligne) repasse par running puis succeeded", async () => {
    const scene = await seedCreation(bench, { status: "failed" });
    await bench.query("UPDATE project_creations SET error_code = 'name_taken' WHERE id = $1", [
      scene.creationId,
    ]);
    await enqueueCreation(bench, scene);
    const row = await vi.waitFor(
      async () => {
        const current = await creationRow(bench, scene.creationId);
        if (current.status !== "succeeded") throw new Error(`statut ${current.status}`);
        return current;
      },
      { timeout: 40_000, interval: 150 },
    );
    expect(row).toMatchObject({ error_code: null, retry_after_ms: null });
  });
});

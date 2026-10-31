import { randomUUID } from "node:crypto";
import { GitProviderUnavailableError } from "@koklo/domain";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createSeededDatabase } from "./helpers/app.ts";
import {
  createInstallApp,
  ENCRYPTION_KEY,
  INSTALL_APP,
  type InstallBench,
  insertStateRow,
  installationAudit,
  installationBench,
  installScene,
  REDIRECT_URI,
  ROLES_DENIED,
  START_TTL_MS,
  startInstall,
  stateOf,
  stateRows,
} from "./helpers/installations.ts";
import { ManualClock } from "./helpers/leases.ts";
import { insertInstallation, ProviderHarness } from "./helpers/repos.ts";
import { insertSession } from "./helpers/session.ts";
import { createWorld } from "./helpers/tickets.ts";

/** TK-48a2, AC-48-06 : `installation.start` (URL GitHub, état signé lié à l'utilisateur et à l'organisation). */
const bench = installationBench({ beforeAll, afterAll, beforeEach });

describe("installation.start : rôles et authentification", () => {
  it.each(["owner", "admin"] as const)("%s : 200 { url, expiresAt }", async (role) => {
    const b = bench();
    const s = await installScene(b);
    const res = await startInstall(b, s.world.actors[role]);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(["expiresAt", "url"]);
  });

  it.each(ROLES_DENIED)("%s : 403 FORBIDDEN, aucun état, aucun appel fournisseur", async (role) => {
    const b = bench();
    const s = await installScene(b);
    const res = await startInstall(b, s.world.actors[role]);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("FORBIDDEN");
    expect(await stateRows(b.database, s.world.organizationId)).toEqual([]);
    expect(b.harness.calls).toEqual([]);
  });

  it("sans session : 401", async () => {
    expect((await startInstall(bench(), undefined)).status).toBe(401);
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'un même comportement, un test par cas
describe("installation.start : nouvelle installation", () => {
  it("renvoie l'URL d'installation de l'App (slug lu chez le fournisseur) avec le seul paramètre state", async () => {
    const b = bench();
    const s = await installScene(b);
    const res = await startInstall(b, s.owner);

    const [slugCall] = b.harness.callsOf("appSlug");
    expect(slugCall?.result).toEqual(expect.any(String));
    const url = new URL(res.body.url);
    expect(`${url.origin}${url.pathname}`).toBe(
      `https://github.com/apps/${slugCall?.result}/installations/new`,
    );
    expect([...url.searchParams.keys()]).toEqual(["state"]);
    expect(stateOf(res.body.url).length).toBeGreaterThan(20);
  });

  it("expiresAt = maintenant + 10 minutes (horloge de l'application)", async () => {
    const b = bench();
    const s = await installScene(b);
    const now = Date.parse(b.clock.now());
    const res = await startInstall(b, s.owner);
    expect(Date.parse(res.body.expiresAt)).toBe(now + START_TTL_MS);
  });

  it("enregistre un état lié à l'organisation et à l'utilisateur de la session, non consommé", async () => {
    const b = bench();
    const s = await installScene(b);
    const res = await startInstall(b, s.owner);
    const rows = await stateRows(b.database, s.world.organizationId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      organization_id: s.world.organizationId,
      user_id: s.owner.userId,
      installation_id: null,
      consumed_at: null,
    });
    expect(rows[0]?.expires_at.toISOString()).toBe(res.body.expiresAt);
    expect(rows[0]?.nonce.length).toBeGreaterThanOrEqual(16);
  });

  it("deux appels : états et nonces distincts, le premier reste valide (aucune invalidation)", async () => {
    const b = bench();
    const s = await installScene(b);
    const first = await startInstall(b, s.owner);
    const second = await startInstall(b, s.owner);
    expect(stateOf(first.body.url)).not.toBe(stateOf(second.body.url));
    const rows = await stateRows(b.database, s.world.organizationId);
    expect(new Set(rows.map((r) => r.nonce)).size).toBe(2);
    expect(rows.every((r) => r.consumed_at === null)).toBe(true);
  });

  it("aucun secret dans la réponse ni dans les journaux (secret client, clé, nonce en clair)", async () => {
    const b = bench();
    const s = await installScene(b);
    const res = await startInstall(b, s.owner);
    const [row] = await stateRows(b.database, s.world.organizationId);
    const text = JSON.stringify(res.body) + b.lines.join("\n");
    for (const secret of [
      INSTALL_APP.clientSecret,
      ENCRYPTION_KEY.toString("utf8"),
      row?.nonce ?? "?",
    ]) {
      expect(text).not.toContain(secret);
    }
    expect(b.lines.join("\n")).not.toContain(stateOf(res.body.url));
  });

  it("n'ouvre aucune transaction pendant l'appel au fournisseur", async () => {
    const b = bench();
    const s = await installScene(b);
    await startInstall(b, s.owner);
    const calls = b.harness.callsOf("appSlug");
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.every((c) => c.openTransactions === 0)).toBe(true);
  });
});

describe("installation.start : ré-autorisation (installationId)", () => {
  it("renvoie l'URL d'autorisation OAuth (client_id, redirect_uri, state) et lie l'installation à l'état", async () => {
    const b = bench();
    const s = await installScene(b);
    const inst = await insertInstallation(b.database, s.world.organizationId);
    const res = await startInstall(b, s.owner, inst.id);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const url = new URL(res.body.url);
    expect(`${url.origin}${url.pathname}`).toBe("https://github.com/login/oauth/authorize");
    expect(url.searchParams.get("client_id")).toBe(INSTALL_APP.clientId);
    expect(url.searchParams.get("redirect_uri")).toBe(REDIRECT_URI);
    expect(url.searchParams.get("state")).toBeTruthy();
    expect([...url.searchParams.keys()].sort()).toEqual(["client_id", "redirect_uri", "state"]);
    expect(res.body.url).not.toContain(INSTALL_APP.clientSecret);
    const [row] = await stateRows(b.database, s.world.organizationId);
    expect(row?.installation_id).toBe(inst.id);
  });

  it("installationId d'une autre organisation (IDOR) : 404 NOT_FOUND, aucun état, aucun détail", async () => {
    const b = bench();
    const s = await installScene(b);
    const foreign = await createWorld(b.database);
    const theirs = await insertInstallation(b.database, foreign.organizationId, {
      ownerLogin: "autrui",
    });
    const res = await startInstall(b, s.owner, theirs.id);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("NOT_FOUND");
    expect(JSON.stringify(res.body)).not.toContain("autrui");
    expect(await stateRows(b.database, s.world.organizationId)).toEqual([]);
    expect(await stateRows(b.database, foreign.organizationId)).toEqual([]);
  });

  it("installationId inconnu ou installation supprimée : 404", async () => {
    const b = bench();
    const s = await installScene(b);
    const gone = await insertInstallation(b.database, s.world.organizationId, {
      status: "deleted",
    });
    for (const id of [gone.id, "123e4567-e89b-42d3-a456-426614174000"]) {
      const res = await startInstall(b, s.owner, id);
      expect(res.status, id).toBe(404);
      expect(res.body.code, id).toBe("NOT_FOUND");
    }
  });

  it("installationId non UUID : refusé (400), aucun état", async () => {
    const b = bench();
    const s = await installScene(b);
    const res = await startInstall(b, s.owner, "pas-un-uuid");
    expect(res.status).toBe(400);
    expect(await stateRows(b.database, s.world.organizationId)).toEqual([]);
  });
});

describe("installation.start : fournisseur indisponible", () => {
  it("l'échec de appSlug devient 503 PROVIDER_UNAVAILABLE, sans état ni audit", async () => {
    const b = bench();
    const s = await installScene(b);
    b.harness.failWith("appSlug", new GitProviderUnavailableError({ operation: "appSlug" }));
    const res = await startInstall(b, s.owner);
    expect(res.status).toBe(503);
    expect(res.body.code).toBe("PROVIDER_UNAVAILABLE");
    expect(await stateRows(b.database, s.world.organizationId)).toEqual([]);
    expect(await installationAudit(b.database, s.world.organizationId)).toEqual([]);
  });

  async function unconfigured(over: Parameters<typeof createInstallApp>[3], withProvider = true) {
    const database = await createSeededDatabase();
    const clock = new ManualClock();
    const harness = withProvider ? await ProviderHarness.create(clock) : null;
    const app = await createInstallApp(database, harness, clock, over);
    const world = await createWorld(database);
    const res = await startInstall({ app } as never, world.actors.owner);
    const states = await stateRows(database, world.organizationId);
    const audit = await installationAudit(database, world.organizationId);
    await app.close();
    await database.dispose();
    return { res, states, audit, calls: harness?.calls ?? [] };
  }

  it.each([
    ["sans identifiants client de l'App", { githubApp: { appId: "1", privateKey: "k" } }],
    ["sans clé de chiffrement", { encryptionKey: undefined }],
  ])("%s : 503 PROVIDER_UNAVAILABLE, aucun état, aucun audit", async (_label, over) => {
    const out = await unconfigured(over as never);
    expect(out.res.status).toBe(503);
    expect(out.res.body.code).toBe("PROVIDER_UNAVAILABLE");
    expect(out.states).toEqual([]);
    expect(out.audit).toEqual([]);
  });

  it("sans App GitHub configurée (fournisseur nul) : 503 PROVIDER_UNAVAILABLE", async () => {
    const database = await createSeededDatabase();
    const app = await createInstallApp(database, null, new ManualClock(), { githubApp: undefined });
    const world = await createWorld(database);
    const res = await startInstall({ app } as never, world.actors.owner);
    expect(res.status).toBe(503);
    expect(res.body.code).toBe("PROVIDER_UNAVAILABLE");
    await app.close();
    await database.dispose();
  });
});

describe("installation.start : purge opportuniste et plafond", () => {
  const PAST = "2026-01-01T00:00:00.000Z";

  it("supprime les états expirés de l'organisation, garde les valides et les consommés encore valides", async () => {
    const b = bench();
    const s = await installScene(b);
    const expired = await insertStateRow(b.database, s.world.organizationId, s.owner.userId, {
      createdAtIso: PAST,
    });
    const valid = await insertStateRow(b.database, s.world.organizationId, s.owner.userId);
    const consumed = await insertStateRow(b.database, s.world.organizationId, s.owner.userId, {
      consumed: true,
    });

    expect((await startInstall(b, s.owner)).status).toBe(200);

    const ids = (await stateRows(b.database, s.world.organizationId)).map((r) => r.id);
    expect(ids).not.toContain(expired);
    expect(ids).toEqual(expect.arrayContaining([valid, consumed]));
    expect(ids).toHaveLength(3);
  });

  it("au plus 20 états en attente par utilisateur : le 21e est refusé 422 VALIDATION, sans écriture", async () => {
    const b = bench();
    const s = await installScene(b);
    for (let i = 0; i < 20; i++) {
      expect((await startInstall(b, s.owner)).status, `start ${i}`).toBe(200);
    }
    const res = await startInstall(b, s.owner);
    expect(res.status).toBe(422);
    expect(res.body.code).toBe("VALIDATION");
    expect(res.body.data).toMatchObject({ message: "too_many_pending" });
    expect(await stateRows(b.database, s.world.organizationId)).toHaveLength(20);
    // Le plafond est par utilisateur : l'autre administrateur n'est pas bloqué.
    expect((await startInstall(b, s.admin)).status).toBe(200);
  });

  it("les états consommés et expirés ne comptent pas dans le plafond", async () => {
    const b = bench();
    const s = await installScene(b);
    for (let i = 0; i < 15; i++) {
      await insertStateRow(b.database, s.world.organizationId, s.owner.userId, { consumed: true });
    }
    for (let i = 0; i < 15; i++) {
      await insertStateRow(b.database, s.world.organizationId, s.owner.userId, {
        createdAtIso: PAST,
      });
    }
    expect((await startInstall(b, s.owner)).status).toBe(200);
  });
});

describe("installation.start : plafond et purge par utilisateur, toutes organisations confondues", () => {
  const PAST = "2026-01-01T00:00:00.000Z";

  /** L'utilisateur `owner` de la scène `s` devient aussi owner d'une autre organisation Koklo. */
  async function joinSecondOrganization(b: InstallBench, userId: string) {
    const other = await createWorld(b.database);
    await b.database.query(
      `INSERT INTO members (id, organization_id, user_id, role, created_at, updated_at)
       VALUES ($1, $2, $3, 'owner', now(), now())`,
      [randomUUID(), other.organizationId, userId],
    );
    const cookie = await insertSession(b.database, {
      userId,
      activeOrganizationId: other.organizationId,
    });
    return { organizationId: other.organizationId, cookie };
  }

  it("20 états en attente dans une organisation bloquent le 21e dans une autre (422 too_many_pending)", async () => {
    const b = bench();
    const s = await installScene(b);
    const second = await joinSecondOrganization(b, s.owner.userId);
    for (let i = 0; i < 20; i++) {
      expect((await startInstall(b, s.owner)).status, `start ${i}`).toBe(200);
    }
    const res = await startInstall(b, { cookie: second.cookie });
    expect(res.status).toBe(422);
    expect(res.body.data).toMatchObject({ message: "too_many_pending" });
    expect(await stateRows(b.database, second.organizationId)).toHaveLength(0);
  });

  it("les états expirés de l'utilisateur dans les autres organisations sont purgés à chaque start", async () => {
    const b = bench();
    const s = await installScene(b);
    const second = await joinSecondOrganization(b, s.owner.userId);
    const expired = await insertStateRow(b.database, second.organizationId, s.owner.userId, {
      createdAtIso: PAST,
    });
    const foreign = await insertStateRow(b.database, second.organizationId, s.admin.userId, {
      createdAtIso: PAST,
    });
    expect((await startInstall(b, s.owner)).status).toBe(200);
    const ids = (await stateRows(b.database, second.organizationId)).map((r) => r.id);
    expect(ids).not.toContain(expired);
    // Seuls les états de l'utilisateur qui démarre sont purgés hors de son organisation.
    expect(ids).toContain(foreign);
  });
});

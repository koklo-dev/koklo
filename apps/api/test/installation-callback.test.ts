import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  callback,
  credentialRows,
  expectOutcome,
  githubReturn,
  installationAudit,
  installationBench,
  installationRows,
  installScene,
  providerCalls,
  REDIRECT_URI,
  startState,
  stateRows,
} from "./helpers/installations.ts";
import { send } from "./helpers/tickets.ts";

/** TK-48a2, AC-48-07 : callback nominal (faux fournisseur) - liaison, jeton chiffré, audit, redirection. */
const bench = installationBench({ beforeAll, afterAll, beforeEach });

async function install(over: Record<string, string | undefined> = {}, ownerKind?: "user") {
  const b = bench();
  const s = await installScene(b, ownerKind ? { ownerKind } : {});
  const state = await startState(b, s.owner);
  const res = await callback(b.app, s.owner.cookie, githubReturn(s, state, over));
  return { b, s, state, res };
}

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'un même comportement, un test par cas
describe("callback nominal", () => {
  it("303 vers /github?result=installed", async () => {
    const { res } = await install();
    expectOutcome(res, "installed");
    expect(res.headers["cache-control"]).toMatch(/no-store/);
    expect(res.headers["set-cookie"]).toBeUndefined();
  });

  it("crée la ligne provider_installations de l'organisation de l'état, propriétaire pris chez GitHub", async () => {
    const { b, s } = await install();
    const rows = await installationRows(b.database, s.world.organizationId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      organization_id: s.world.organizationId,
      external_id: s.github.externalId,
      owner_kind: s.github.ownerKind,
      owner_login: s.github.ownerLogin,
      status: "active",
    });
  });

  it("le propriétaire et le type viennent de GET /user/installations, jamais de la requête", async () => {
    const { b, s } = await install({
      owner_login: "evil",
      ownerLogin: "evil",
      account: "evil",
      owner_kind: "user",
      target_type: "User",
    });
    const [row] = await installationRows(b.database, s.world.organizationId);
    expect(row).toMatchObject({ owner_login: s.github.ownerLogin, owner_kind: "organization" });
  });

  it("compte personnel : ownerKind user et login du compte, tels que GitHub les rend", async () => {
    const { b, s } = await install({}, "user");
    const [row] = await installationRows(b.database, s.world.organizationId);
    expect(row).toMatchObject({ owner_kind: "user", owner_login: s.login });
  });

  it("échange le code reçu avec le redirect_uri du web, puis liste les installations avec CE jeton", async () => {
    const { b, s } = await install();
    const [exchange] = b.harness.callsOf("exchangeUserCode");
    expect(exchange?.request).toEqual({ code: `fake-code-${s.login}`, redirectUri: REDIRECT_URI });
    const [list] = b.harness.callsOf("listUserInstallations");
    const token = (exchange?.result as { token: string } | undefined)?.token;
    expect(list?.request).toMatchObject({ auth: { kind: "user", token } });
    expect(b.harness.names().indexOf("exchangeUserCode")).toBeLessThan(
      b.harness.names().indexOf("listUserInstallations"),
    );
  });

  it("aucun appel fournisseur n'est fait dans une transaction ouverte", async () => {
    const { b } = await install();
    const calls = providerCalls(b, "exchangeUserCode", "listUserInstallations");
    expect(calls).toHaveLength(2);
    expect(calls.every((c) => c.openTransactions === 0)).toBe(true);
  });

  it("stocke le jeton utilisateur chiffré pour (utilisateur de la session, installation)", async () => {
    const { b, s } = await install();
    const [inst] = await installationRows(b.database, s.world.organizationId);
    const [cred] = await credentialRows(b.database, s.world.organizationId);
    expect(cred).toMatchObject({
      organization_id: s.world.organizationId,
      user_id: s.owner.userId,
      installation_id: inst?.id,
      key_version: 1,
    });
    expect(cred?.nonce).toHaveLength(12);
    expect(cred?.refresh_expires_at).not.toBeNull();
    const exchanged = b.harness.callsOf("exchangeUserCode")[0]?.result as {
      token: string;
      refreshToken: string;
      expiresAt: string;
    };
    expect(cred?.expires_at.toISOString()).toBe(exchanged.expiresAt);
    for (const secret of [exchanged.token, exchanged.refreshToken]) {
      expect(cred?.ciphertext.includes(Buffer.from(secret, "utf8"))).toBe(false);
    }
  });

  it("le jeton stocké sert ensuite : repo.createSpec sur un compte personnel n'exige plus USER_TOKEN_REQUIRED", async () => {
    const { b, s } = await install({}, "user");
    const [inst] = await installationRows(b.database, s.world.organizationId);
    const created = await send(
      b.app,
      s.owner.cookie,
      "post",
      `/projects/${s.world.projectId}/spec-repo`,
      { projectId: s.world.projectId, installationId: inst?.id },
    );
    expect(created.status, JSON.stringify(created.body)).toBe(200);
    expect(created.body.ownerLogin).toBe(s.login);
  });

  it("consomme l'état (consumed_at posé) et ne crée aucun autre état", async () => {
    const { b, s } = await install();
    const rows = await stateRows(b.database, s.world.organizationId);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.consumed_at).not.toBeNull();
  });

  it("écrit une seule entrée d'audit installation.link (cible installation, acteur humain)", async () => {
    const { b, s } = await install();
    const [inst] = await installationRows(b.database, s.world.organizationId);
    const audit = (await installationAudit(b.database, s.world.organizationId)).filter(
      (a) => a.action !== "installation.start",
    );
    expect(audit).toEqual([
      {
        action: "installation.link",
        target_kind: "installation",
        target_id: inst?.id,
        actor_kind: "human",
        actor_id: s.owner.userId,
      },
    ]);
  });

  it("le callback est accessible à owner et admin : un admin qui a démarré le flux peut le finir", async () => {
    const b = bench();
    const s = await installScene(b);
    const state = await startState(b, s.admin);
    const res = await callback(b.app, s.admin.cookie, githubReturn(s, state));
    expectOutcome(res, "installed");
    const [cred] = await credentialRows(b.database, s.world.organizationId);
    expect(cred?.user_id).toBe(s.admin.userId);
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'un même comportement, un test par cas
describe("callback : organisation prise de l'état, pas de la session ni de la requête", () => {
  it("l'utilisateur a changé d'organisation active : l'installation va dans l'organisation de l'état", async () => {
    const b = bench();
    const s = await installScene(b);
    const other = await installScene(b);
    const state = await startState(b, s.owner);
    // Même utilisateur, session dont l'organisation active est une autre organisation dont il est owner.
    await b.database.query(
      `INSERT INTO members (id, organization_id, user_id, role, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, 'owner', now(), now())`,
      [other.world.organizationId, s.owner.userId],
    );
    await b.database.query("UPDATE sessions SET active_organization_id = $1 WHERE user_id = $2", [
      other.world.organizationId,
      s.owner.userId,
    ]);

    const res = await callback(b.app, s.owner.cookie, githubReturn(s, state));

    expectOutcome(res, "installed");
    expect(await installationRows(b.database, s.world.organizationId)).toHaveLength(1);
    expect(await installationRows(b.database, other.world.organizationId)).toEqual([]);
    expect(await credentialRows(b.database, other.world.organizationId)).toEqual([]);
  });

  it("des paramètres organization_id / organizationId dans la requête sont ignorés", async () => {
    const b = bench();
    const s = await installScene(b);
    const other = await installScene(b);
    const state = await startState(b, s.owner);
    const res = await callback(
      b.app,
      s.owner.cookie,
      githubReturn(s, state, {
        organization_id: other.world.organizationId,
        organizationId: other.world.organizationId,
        org: other.world.organizationId,
      }),
    );
    expectOutcome(res, "installed");
    expect(await installationRows(b.database, other.world.organizationId)).toEqual([]);
    expect(await installationRows(b.database, s.world.organizationId)).toHaveLength(1);
  });

  it("l'utilisateur n'est plus owner/admin de l'organisation de l'état : denied, rien d'écrit", async () => {
    const b = bench();
    const s = await installScene(b);
    const state = await startState(b, s.admin);
    await b.database.query("UPDATE members SET role = 'dev' WHERE user_id = $1", [s.admin.userId]);
    const res = await callback(b.app, s.admin.cookie, githubReturn(s, state));
    expectOutcome(res, "denied");
    expect(await installationRows(b.database, s.world.organizationId)).toEqual([]);
    expect(await credentialRows(b.database, s.world.organizationId)).toEqual([]);
  });

  it("l'utilisateur a quitté l'organisation de l'état : denied, rien d'écrit", async () => {
    const b = bench();
    const s = await installScene(b);
    const state = await startState(b, s.admin);
    await b.database.query("DELETE FROM members WHERE user_id = $1", [s.admin.userId]);
    const res = await callback(b.app, s.admin.cookie, githubReturn(s, state));
    expectOutcome(res, "denied");
    expect(await installationRows(b.database, s.world.organizationId)).toEqual([]);
  });
});

describe("callback : atomicité", () => {
  it("si l'audit échoue, ni installation ni jeton ne subsistent et la redirection est provider_error", async () => {
    const b = bench();
    const s = await installScene(b);
    const state = await startState(b, s.owner);
    await b.database.query("INSERT INTO audit_fail (action) VALUES ('installation.link')");
    const res = await callback(b.app, s.owner.cookie, githubReturn(s, state));
    expectOutcome(res, "provider_error");
    expect(await installationRows(b.database, s.world.organizationId)).toEqual([]);
    expect(await credentialRows(b.database, s.world.organizationId)).toEqual([]);
  });

  it("deux retours simultanés avec le même état : un seul 'installed', une seule ligne", async () => {
    const b = bench();
    const s = await installScene(b);
    const state = await startState(b, s.owner);
    const [one, two] = await Promise.all([
      callback(b.app, s.owner.cookie, githubReturn(s, state)),
      callback(b.app, s.owner.cookie, githubReturn(s, state)),
    ]);
    const outcomes = [one.headers.location, two.headers.location].sort();
    expect(outcomes).toEqual(["/github?result=installed", "/github?result=invalid_state"]);
    expect(await installationRows(b.database, s.world.organizationId)).toHaveLength(1);
    expect(await credentialRows(b.database, s.world.organizationId)).toHaveLength(1);
    expect(b.harness.callsOf("exchangeUserCode")).toHaveLength(1);
  });
});

describe("callback : méthode et routes voisines", () => {
  it("POST /api/github/callback n'existe pas", async () => {
    const b = bench();
    const s = await installScene(b);
    // Précondition : le GET existe (sinon un 404 trivial prouverait le contraire de ce qu'on veut).
    expectOutcome(await callback(b.app, s.owner.cookie, { state: "x" }), "invalid_state");
    const res = await send(b.app, s.owner.cookie, "post", "/api/github/callback", {});
    expect([404, 405]).toContain(res.status);
  });

  it("/api/github/installed n'est pas construit (lier sans preuve de jeton utilisateur serait une faille)", async () => {
    const b = bench();
    const s = await installScene(b);
    const state = await startState(b, s.owner);
    expect(state.length).toBeGreaterThan(0);
    expectOutcome(await callback(b.app, s.owner.cookie, { state: "x" }), "invalid_state");
    const res = await send(
      b.app,
      s.owner.cookie,
      "get",
      `/api/github/installed?installation_id=${s.github.externalId}&state=${encodeURIComponent(state)}`,
    );
    expect(res.status).toBe(404);
    expect(await installationRows(b.database, s.world.organizationId)).toEqual([]);
  });
});

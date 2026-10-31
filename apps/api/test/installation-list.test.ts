import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  callback,
  credentialRows,
  githubReturn,
  installationBench,
  installScene,
  listInstallations,
  ROLES_DENIED,
  startState,
} from "./helpers/installations.ts";
import { insertInstallation } from "./helpers/repos.ts";
import { createWorld } from "./helpers/tickets.ts";

/**
 * TK-48a2, AC-48-05 : `installation.list` lit la base seule, pour l'organisation de la session,
 * réservé à owner/admin ; ni identifiant externe ni jeton ; `userAuthorization` décrit l'appelant.
 */
const bench = installationBench({ beforeAll, afterAll, beforeEach });

describe("installation.list : rôles et authentification", () => {
  it.each(["owner", "admin"] as const)("%s : 200", async (role) => {
    const b = bench();
    const s = await installScene(b);
    const res = await listInstallations(b, s.world.actors[role]);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toEqual([]);
  });

  it.each(ROLES_DENIED)("%s : 403 FORBIDDEN", async (role) => {
    const b = bench();
    const s = await installScene(b);
    await insertInstallation(b.database, s.world.organizationId);
    const res = await listInstallations(b, s.world.actors[role]);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("FORBIDDEN");
    expect(JSON.stringify(res.body)).not.toContain("acme");
  });

  it("sans session : 401", async () => {
    const res = await listInstallations(bench(), undefined);
    expect(res.status).toBe(401);
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'un même comportement, un test par cas
describe("installation.list : contenu", () => {
  it("renvoie les installations de l'organisation de la session, jamais celles d'une autre (IDOR)", async () => {
    const b = bench();
    const s = await installScene(b);
    const mine = await insertInstallation(b.database, s.world.organizationId, {
      ownerLogin: "acme-mienne",
    });
    const foreign = await createWorld(b.database);
    await insertInstallation(b.database, foreign.organizationId, { ownerLogin: "autrui" });

    const res = await listInstallations(b, s.owner);

    expect(res.status).toBe(200);
    expect(res.body.map((i: { id: string }) => i.id)).toEqual([mine.id]);
    expect(JSON.stringify(res.body)).not.toContain("autrui");
  });

  it("expose id, provider, propriétaire, statut, autorisation et date, sans identifiant externe", async () => {
    const b = bench();
    const s = await installScene(b);
    const row = await insertInstallation(b.database, s.world.organizationId, {
      ownerKind: "user",
      ownerLogin: "octo",
      externalId: "424242",
    });
    const res = await listInstallations(b, s.owner);
    expect(res.body).toEqual([
      {
        id: row.id,
        provider: "github",
        ownerKind: "user",
        ownerLogin: "octo",
        status: "active",
        userAuthorization: "absent",
        createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      },
    ]);
    expect(JSON.stringify(res.body)).not.toContain("424242");
    expect(JSON.stringify(res.body)).not.toMatch(/external|token|cipher|nonce|secret/i);
  });

  it("garde les installations suspendues et supprimées (l'écran les grise), triées par création", async () => {
    const b = bench();
    const s = await installScene(b);
    const a = await insertInstallation(b.database, s.world.organizationId, { status: "active" });
    const c = await insertInstallation(b.database, s.world.organizationId, {
      status: "suspended",
    });
    const d = await insertInstallation(b.database, s.world.organizationId, { status: "deleted" });
    const res = await listInstallations(b, s.owner);
    expect(res.body.map((i: { id: string; status: string }) => [i.id, i.status])).toEqual([
      [a.id, "active"],
      [c.id, "suspended"],
      [d.id, "deleted"],
    ]);
  });

  it("lit la base seule : aucun appel au fournisseur, même sans fournisseur configuré", async () => {
    const b = bench();
    const s = await installScene(b);
    await insertInstallation(b.database, s.world.organizationId);
    const res = await listInstallations(b, s.owner);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(b.harness.calls).toEqual([]);
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'un même comportement, un test par cas
describe("installation.list : userAuthorization de l'appelant", () => {
  async function linked() {
    const b = bench();
    const s = await installScene(b);
    const state = await startState(b, s.owner);
    const res = await callback(b.app, s.owner.cookie, githubReturn(s, state));
    expect(res.headers.location).toBe("/github?result=installed");
    return { b, s };
  }

  it("absent tant que l'appelant n'a pas de jeton ; active après le callback ; l'autre admin reste absent", async () => {
    const b = bench();
    const s = await installScene(b);
    const before = await insertInstallation(b.database, s.world.organizationId);
    expect((await listInstallations(b, s.owner)).body[0].userAuthorization).toBe("absent");
    expect(before.id).toBeTruthy();

    const state = await startState(b, s.owner);
    await callback(b.app, s.owner.cookie, githubReturn(s, state));

    const mine = await listInstallations(b, s.owner);
    const linkedOne = mine.body.find(
      (i: { ownerLogin: string }) => i.ownerLogin === s.github.ownerLogin,
    );
    expect(linkedOne.userAuthorization).toBe("active");
    const theirs = await listInstallations(b, s.admin);
    const same = theirs.body.find((i: { id: string }) => i.id === linkedOne.id);
    expect(same.userAuthorization).toBe("absent");
  });

  it("expired quand le jeton est expiré et non renouvelable (jeton ET refresh expirés)", async () => {
    const { b, s } = await linked();
    await b.database.query(
      "UPDATE provider_user_credentials SET expires_at = now() - interval '1 hour', refresh_expires_at = now() - interval '1 minute' WHERE organization_id = $1",
      [s.world.organizationId],
    );
    const res = await listInstallations(b, s.owner);
    expect(res.body[0].userAuthorization).toBe("expired");
  });

  it("expired quand le jeton est expiré et qu'aucune date de refresh n'existe", async () => {
    const { b, s } = await linked();
    await b.database.query(
      "UPDATE provider_user_credentials SET expires_at = now() - interval '1 hour', refresh_expires_at = NULL WHERE organization_id = $1",
      [s.world.organizationId],
    );
    expect((await listInstallations(b, s.owner)).body[0].userAuthorization).toBe("expired");
  });

  it("active quand le jeton est expiré mais renouvelable (refresh encore valide)", async () => {
    const { b, s } = await linked();
    await b.database.query(
      "UPDATE provider_user_credentials SET expires_at = now() - interval '1 hour', refresh_expires_at = now() + interval '30 days' WHERE organization_id = $1",
      [s.world.organizationId],
    );
    expect((await listInstallations(b, s.owner)).body[0].userAuthorization).toBe("active");
    expect(await credentialRows(b.database, s.world.organizationId)).toHaveLength(1);
  });

  it("ne déchiffre rien et n'appelle pas le fournisseur", async () => {
    const { b, s } = await linked();
    b.harness.reset();
    await listInstallations(b, s.owner);
    expect(b.harness.calls).toEqual([]);
  });
});

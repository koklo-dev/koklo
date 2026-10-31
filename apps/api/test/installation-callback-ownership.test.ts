import { GitProviderUnavailableError } from "@koklo/domain";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  callback,
  credentialRows,
  expectNothingLinked,
  expectOutcome,
  githubReturn,
  installationAudit,
  installationBench,
  installationByExternal,
  installationRows,
  installScene,
  startState,
  stateRows,
} from "./helpers/installations.ts";

/**
 * TK-48a2, B1 (revue sécurité) : `GET /user/installations` liste aussi les installations des
 * organisations GitHub dont l'utilisateur est seulement membre. Une installation n'est liée que si
 * l'utilisateur authentifié par le jeton en est le propriétaire : le compte personnel lui-même, ou un
 * admin actif de l'organisation GitHub. Sinon `not_owner`, rien d'écrit, audit `link_refused`.
 */
const bench = installationBench({ beforeAll, afterAll, beforeEach });

type SceneOver = Parameters<typeof installScene>[1];

async function attempt(over: SceneOver = {}) {
  const b = bench();
  const s = await installScene(b, over);
  const state = await startState(b, s.owner);
  const res = await callback(b.app, s.owner.cookie, githubReturn(s, state));
  return { b, s, res };
}

async function expectRefused(over: SceneOver) {
  const { b, s, res } = await attempt(over);
  expectOutcome(res, "not_owner");
  await expectNothingLinked(b.database, s.world.organizationId);
  expect(await installationByExternal(b.database, s.github.externalId)).toEqual([]);
  const refused = (await installationAudit(b.database, s.world.organizationId)).filter(
    (a) => a.action === "installation.link_refused",
  );
  expect(refused).toEqual([
    {
      action: "installation.link_refused",
      target_kind: "organization",
      target_id: s.world.organizationId,
      actor_kind: "human",
      actor_id: s.owner.userId,
    },
  ]);
  expect(JSON.stringify(refused)).not.toContain(s.github.externalId);
  expect((await stateRows(b.database, s.world.organizationId))[0]?.consumed_at).not.toBeNull();
  return { b, s };
}

describe("organisation GitHub", () => {
  it("simple membre : not_owner, aucune ligne installation ni jeton", async () => {
    await expectRefused({ githubRole: "member" });
  });

  it("invitation en attente ou aucun lien : not_owner", async () => {
    await expectRefused({ githubRole: "pending" });
    await expectRefused({ githubRole: "none" });
  });

  it("admin actif : installed, installation et jeton chiffré écrits", async () => {
    const { b, s, res } = await attempt({ githubRole: "admin" });
    expectOutcome(res, "installed");
    expect(await installationRows(b.database, s.world.organizationId)).toHaveLength(1);
    expect(await credentialRows(b.database, s.world.organizationId)).toHaveLength(1);
  });

  it("le rôle est demandé avec le jeton de l'utilisateur, hors transaction, après la preuve de visibilité", async () => {
    const { b, s } = await attempt({ githubRole: "admin" });
    const [exchange] = b.harness.callsOf("exchangeUserCode");
    const [role] = b.harness.callsOf("getUserOwnerRole");
    const token = (exchange?.result as { token: string } | undefined)?.token;
    expect(role?.request).toMatchObject({
      auth: { kind: "user", token },
      owner: { kind: "organization", login: s.github.ownerLogin },
    });
    expect(role?.openTransactions).toBe(0);
    const names = b.harness.names();
    expect(names.indexOf("listUserInstallations")).toBeLessThan(names.indexOf("getUserOwnerRole"));
  });

  it("l'organisation squattée avant la vraie est impossible : le vrai admin lie ensuite sans already_linked", async () => {
    const b = bench();
    const attacker = await installScene(b, { githubRole: "member" });
    const squat = await startState(b, attacker.owner);
    expectOutcome(
      await callback(b.app, attacker.owner.cookie, githubReturn(attacker, squat)),
      "not_owner",
    );
    await expectNothingLinked(b.database, attacker.world.organizationId);

    // Le vrai administrateur de la même organisation GitHub, depuis son organisation Koklo.
    const victim = await installScene(b, { githubRole: "admin" });
    const real = { ...victim, github: attacker.github };
    b.harness.inner.seedUserInstallation(victim.login, attacker.github);
    b.harness.inner.seedOrgMembership(victim.login, attacker.github.ownerLogin, "admin");
    const state = await startState(b, victim.owner);
    expectOutcome(
      await callback(b.app, victim.owner.cookie, githubReturn(real, state)),
      "installed",
    );
    const [row] = await installationByExternal(b.database, attacker.github.externalId);
    expect(row?.organization_id).toBe(victim.world.organizationId);
  });
});

describe("compte personnel", () => {
  it("son propre compte : installed", async () => {
    const { b, s, res } = await attempt({ ownerKind: "user" });
    expectOutcome(res, "installed");
    const [row] = await installationRows(b.database, s.world.organizationId);
    expect(row).toMatchObject({ owner_kind: "user", owner_login: s.login });
  });

  it("le compte personnel d'un autre login (visible du jeton) : not_owner, rien d'écrit", async () => {
    await expectRefused({ ownerKind: "user", ownerLogin: "compte-d-un-tiers" });
  });
});

describe("échec du fournisseur pendant la vérification", () => {
  it("provider_error, sans lien ni jeton ni audit de refus, jamais un 500", async () => {
    const b = bench();
    const s = await installScene(b, { githubRole: "admin" });
    const state = await startState(b, s.owner);
    b.harness.failWith(
      "getUserOwnerRole",
      new GitProviderUnavailableError({ operation: "getUserOwnerRole" }),
    );
    const res = await callback(b.app, s.owner.cookie, githubReturn(s, state));
    expectOutcome(res, "provider_error");
    await expectNothingLinked(b.database, s.world.organizationId);
    expect(await installationByExternal(b.database, s.github.externalId)).toEqual([]);
    const refused = (await installationAudit(b.database, s.world.organizationId)).filter(
      (a) => a.action === "installation.link_refused",
    );
    expect(refused).toEqual([]);
  });
});

describe("ré-autorisation", () => {
  it("une installation déjà liée dont l'utilisateur n'est plus admin GitHub n'est pas ré-autorisée", async () => {
    const b = bench();
    const s = await installScene(b, { githubRole: "admin" });
    expectOutcome(
      await callback(b.app, s.owner.cookie, githubReturn(s, await startState(b, s.owner))),
      "installed",
    );
    const [inst] = await installationRows(b.database, s.world.organizationId);
    const [before] = await credentialRows(b.database, s.world.organizationId);

    const demoted = await installScene(b, { githubRole: "member" });
    b.harness.inner.seedUserInstallation(demoted.login, s.github);
    b.harness.inner.seedOrgMembership(demoted.login, s.github.ownerLogin, "member");
    const state = await startState(b, s.owner, inst?.id);
    const res = await callback(b.app, s.owner.cookie, {
      code: `fake-code-${demoted.login}`,
      state,
    });
    expectOutcome(res, "not_owner");
    const [after] = await credentialRows(b.database, s.world.organizationId);
    expect(after?.ciphertext.equals(before?.ciphertext ?? Buffer.alloc(0))).toBe(true);
  });
});

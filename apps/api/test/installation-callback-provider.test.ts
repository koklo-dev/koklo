import {
  GitAuthExpiredError,
  GitProviderUnavailableError,
  InvalidUserCodeError,
} from "@koklo/domain";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createSeededDatabase } from "./helpers/app.ts";
import {
  callback,
  codeOf,
  createInstallApp,
  credentialRows,
  expectNothingLinked,
  expectOutcome,
  githubReturn,
  installationAudit,
  installationBench,
  installationByExternal,
  installationRows,
  installScene,
  reseed,
  startState,
  stateRows,
} from "./helpers/installations.ts";
import { ManualClock } from "./helpers/leases.ts";
import { insertInstallation, ProviderHarness } from "./helpers/repos.ts";
import { createWorld, send } from "./helpers/tickets.ts";

/**
 * TK-48a2, AC-48-09 / 10 : le code est invalide, l'installation n'est pas celle de l'utilisateur, déjà
 * liée ailleurs, ou le fournisseur est en panne. Aucune ligne n'est jamais écrite dans ces cas ;
 * l'identifiant `installation_id` de la requête n'est JAMAIS une preuve (anti-détournement).
 */
const bench = installationBench({ beforeAll, afterAll, beforeEach });

async function flow(over: Record<string, string | undefined> = {}) {
  const b = bench();
  const s = await installScene(b);
  const state = await startState(b, s.owner);
  return { b, s, state, run: () => callback(b.app, s.owner.cookie, githubReturn(s, state, over)) };
}

describe("code invalide ou absent", () => {
  it("code inconnu du fournisseur : denied, rien d'écrit, état consommé", async () => {
    const { b, s, run } = await flow({ code: "fake-code-" });
    expectOutcome(await run(), "denied");
    await expectNothingLinked(b.database, s.world.organizationId);
    expect((await stateRows(b.database, s.world.organizationId))[0]?.consumed_at).not.toBeNull();
  });

  it("InvalidUserCodeError levée par le port : denied", async () => {
    const { b, s, run } = await flow();
    b.harness.failWith(
      "exchangeUserCode",
      new InvalidUserCodeError({ operation: "exchangeUserCode" }),
    );
    expectOutcome(await run(), "denied");
    await expectNothingLinked(b.database, s.world.organizationId);
    expect(b.harness.callsOf("listUserInstallations")).toEqual([]);
  });

  it("code déjà utilisé (rejeu du code chez GitHub avec un nouvel état) : denied", async () => {
    const b = bench();
    const s = await installScene(b);
    const first = await startState(b, s.owner);
    expectOutcome(await callback(b.app, s.owner.cookie, githubReturn(s, first)), "installed");
    const other = await installScene(b);
    const second = await startState(b, other.owner);
    const res = await callback(b.app, other.owner.cookie, githubReturn(s, second));
    expectOutcome(res, "denied");
    await expectNothingLinked(b.database, other.world.organizationId);
  });

  it("retour sans code (l'utilisateur a refusé l'autorisation) : denied, aucun échange", async () => {
    const { b, s, run } = await flow({ code: undefined });
    expectOutcome(await run(), "denied");
    await expectNothingLinked(b.database, s.world.organizationId);
    expect(b.harness.callsOf("exchangeUserCode")).toEqual([]);
  });

  it("retour d'erreur OAuth (error=access_denied, sans code) : denied", async () => {
    const { b, s, run } = await flow({
      code: undefined,
      error: "access_denied",
      installation_id: undefined,
    });
    expectOutcome(await run(), "denied");
    await expectNothingLinked(b.database, s.world.organizationId);
  });

  it("installation_id absent d'une première installation : denied (rien à lier)", async () => {
    const { b, s, run } = await flow({ installation_id: undefined });
    expectOutcome(await run(), "denied");
    await expectNothingLinked(b.database, s.world.organizationId);
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'un même comportement, un test par cas
describe("installation absente de GET /user/installations (anti-détournement)", () => {
  it("installation_id d'un autre compte : denied, aucune ligne, aucun jeton, audit link_refused sans identifiant externe", async () => {
    const { b, s, run } = await flow({ installation_id: "999000111" });
    expectOutcome(await run(), "denied");
    await expectNothingLinked(b.database, s.world.organizationId);
    expect(await installationByExternal(b.database, "999000111")).toEqual([]);
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
    expect(JSON.stringify(refused)).not.toContain("999000111");
  });

  it("l'installation d'un compte tiers déjà liée chez nous n'est pas rattachée par un état valide", async () => {
    const b = bench();
    const victim = await createWorld(b.database);
    const theirs = await insertInstallation(b.database, victim.organizationId, {
      externalId: "5550001",
    });
    const s = await installScene(b);
    const state = await startState(b, s.owner);
    const res = await callback(
      b.app,
      s.owner.cookie,
      githubReturn(s, state, { installation_id: "5550001" }),
    );
    expectOutcome(res, "denied");
    expect(await installationRows(b.database, s.world.organizationId)).toEqual([]);
    expect((await installationByExternal(b.database, "5550001"))[0]?.organization_id).toBe(
      victim.organizationId,
    );
    expect(theirs.id).toBeTruthy();
  });

  it("liste vide chez GitHub : denied", async () => {
    const b = bench();
    const s = await installScene(b);
    s.login = "compte-sans-installation";
    const state = await startState(b, s.owner);
    const res = await callback(b.app, s.owner.cookie, githubReturn(s, state));
    expectOutcome(res, "denied");
    await expectNothingLinked(b.database, s.world.organizationId);
  });

  it("la comparaison de l'identifiant est exacte (préfixe, espaces, casse numérique)", async () => {
    for (const forged of [
      (id: string) => id.slice(0, -1),
      (id: string) => ` ${id}`,
      (id: string) => `${id}0`,
      (id: string) => `0${id}`,
    ]) {
      const b = bench();
      const s = await installScene(b);
      const state = await startState(b, s.owner);
      const res = await callback(
        b.app,
        s.owner.cookie,
        githubReturn(s, state, { installation_id: forged(s.github.externalId) }),
      );
      expectOutcome(res, "denied");
      await expectNothingLinked(b.database, s.world.organizationId);
    }
  });
});

describe("installation déjà liée à une autre organisation", () => {
  it("already_linked, aucune ligne ni jeton chez nous, l'autre organisation est intacte et non révélée", async () => {
    const b = bench();
    const s = await installScene(b);
    const owner = await createWorld(b.database);
    const existing = await insertInstallation(b.database, owner.organizationId, {
      externalId: s.github.externalId,
      ownerLogin: "autre-org-secrete",
    });
    const state = await startState(b, s.owner);

    const res = await callback(b.app, s.owner.cookie, githubReturn(s, state));

    expectOutcome(res, "already_linked");
    expect(res.text).not.toContain("autre-org-secrete");
    expect(JSON.stringify(res.headers)).not.toContain("autre-org-secrete");
    await expectNothingLinked(b.database, s.world.organizationId);
    const rows = await installationRows(b.database, owner.organizationId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: existing.id,
      owner_login: "autre-org-secrete",
      status: "active",
    });
    expect(await credentialRows(b.database, owner.organizationId)).toEqual([]);
    const audit = JSON.stringify(await installationAudit(b.database, s.world.organizationId));
    expect(audit).toContain("installation.link_refused");
    expect(audit).not.toContain(owner.organizationId);
  });

  it("déjà liée à la MÊME organisation (nouvelle autorisation) : installed, une seule ligne, jeton mis à jour", async () => {
    const b = bench();
    const s = await installScene(b);
    expectOutcome(
      await callback(b.app, s.owner.cookie, githubReturn(s, await startState(b, s.owner))),
      "installed",
    );
    const [first] = await credentialRows(b.database, s.world.organizationId);
    const s2 = reseed(b, s);

    const again = await callback(
      b.app,
      s.owner.cookie,
      githubReturn(s2, await startState(b, s.owner)),
    );

    expectOutcome(again, "installed");
    expect(await installationRows(b.database, s.world.organizationId)).toHaveLength(1);
    const creds = await credentialRows(b.database, s.world.organizationId);
    expect(creds).toHaveLength(1);
    expect(creds[0]?.id).toBe(first?.id);
    expect(
      Buffer.compare(creds[0]?.ciphertext ?? Buffer.alloc(0), first?.ciphertext ?? Buffer.alloc(0)),
    ).not.toBe(0);
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'un même comportement, un test par cas
describe("fournisseur indisponible", () => {
  it.each([
    [
      "échange du code",
      "exchangeUserCode",
      new GitProviderUnavailableError({ operation: "exchangeUserCode" }),
    ],
    [
      "lecture des installations",
      "listUserInstallations",
      new GitProviderUnavailableError({ operation: "listUserInstallations" }),
    ],
    [
      "lecture des installations (jeton expiré)",
      "listUserInstallations",
      new GitAuthExpiredError({
        operation: "listUserInstallations",
        kind: "user",
        refreshable: false,
      }),
    ],
    ["erreur inattendue du port", "exchangeUserCode", new Error("boom jeton=ghu_SECRET")],
  ])("%s : provider_error, rien d'écrit, aucun détail", async (_label, method, error) => {
    const { b, s, run } = await flow();
    b.harness.failWith(method, error);
    const res = await run();
    expectOutcome(res, "provider_error");
    await expectNothingLinked(b.database, s.world.organizationId);
    expect(res.text).not.toContain("ghu_SECRET");
    expect(b.lines.join("\n")).not.toContain("ghu_SECRET");
  });

  it("une panne passagère n'empêche pas une nouvelle tentative avec un nouvel état", async () => {
    const { b, s, run } = await flow();
    b.harness.failWith(
      "listUserInstallations",
      new GitProviderUnavailableError({ operation: "x" }),
      { once: true },
    );
    expectOutcome(await run(), "provider_error");
    const s2 = reseed(b, s);
    const retry = await callback(
      b.app,
      s.owner.cookie,
      githubReturn(s2, await startState(b, s.owner)),
    );
    expectOutcome(retry, "installed");
  });

  it("App sans identifiants client au retour (config changée entre-temps) : provider_error, rien d'écrit", async () => {
    const database = await createSeededDatabase();
    const clock = new ManualClock();
    const harness = await ProviderHarness.create(clock);
    const full = await createInstallApp(database, harness, clock);
    const bare = await createInstallApp(database, harness, clock, {
      githubApp: { appId: "1", privateKey: "k" },
    });
    try {
      const world = await createWorld(database);
      const login = "gh-sans-client";
      harness.inner.seedUserInstallation(login, {
        externalId: "8100100",
        ownerKind: "organization",
        ownerLogin: "acme-x",
      });
      const startRes = await send(
        full,
        world.actors.owner.cookie,
        "post",
        "/provider/installations/start",
        {},
      );
      const state = new URL(startRes.body.url).searchParams.get("state") ?? "";
      const res = await callback(bare, world.actors.owner.cookie, {
        installation_id: "8100100",
        code: codeOf(login),
        state,
      });
      expectOutcome(res, "provider_error");
      await expectNothingLinked(database, world.organizationId);
      expect(harness.callsOf("exchangeUserCode")).toEqual([]);
    } finally {
      await bare.close();
      await full.close();
      await database.dispose();
    }
  });
});

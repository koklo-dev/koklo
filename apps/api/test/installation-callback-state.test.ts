import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  callback,
  createInstallApp,
  expectNothingLinked,
  expectOutcome,
  githubReturn,
  installationAudit,
  installationBench,
  installScene,
  OTHER_ENCRYPTION_KEY,
  START_TTL_MS,
  startState,
  stateRows,
} from "./helpers/installations.ts";
import { ManualClock } from "./helpers/leases.ts";
import { ProviderHarness } from "./helpers/repos.ts";
import { createWorld } from "./helpers/tickets.ts";

/**
 * TK-48a2, AC-48-08 : le `state` est le seul garde-fou CSRF. Tout contrôle en échec donne
 * `invalid_state`, sans écriture, SANS avoir échangé le code (le code d'un attaquant ne doit jamais
 * être utilisé avec la session de la victime).
 */
const bench = installationBench({ beforeAll, afterAll, beforeEach });

async function rejected(
  mutate: (state: string) => string | undefined,
  cookie: "owner" | "admin" | "anonymous" = "owner",
) {
  const b = bench();
  const s = await installScene(b);
  const state = await startState(b, s.owner);
  const sent = mutate(state);
  const session = cookie === "anonymous" ? undefined : s[cookie].cookie;
  const res = await callback(
    b.app,
    session,
    githubReturn(s, sent ?? "", sent === undefined ? { state: undefined } : {}),
  );
  expectOutcome(res, "invalid_state");
  await expectNothingLinked(b.database, s.world.organizationId);
  expect(b.harness.callsOf("exchangeUserCode")).toEqual([]);
  expect(b.harness.callsOf("listUserInstallations")).toEqual([]);
  return { b, s, state };
}

const flip = (state: string, at: number): string => {
  const char = state[at] === "A" ? "B" : "A";
  return `${state.slice(0, at)}${char}${state.slice(at + 1)}`;
};

describe("état absent ou falsifié", () => {
  it.each([
    ["absent", () => undefined],
    ["vide", () => ""],
    ["aléatoire", () => "pas-un-etat"],
    ["avec un point", () => "abc.def"],
    ["ressemblant à un UUID", () => "123e4567-e89b-42d3-a456-426614174000"],
    ["très long", () => "a".repeat(5000)],
    ["avec un octet nul", (st: string) => `${st}\u0000`],
  ])("%s : invalid_state", async (_label, mutate) => {
    await rejected(mutate);
  });

  it("dernier caractère altéré : invalid_state", async () => {
    await rejected((state) => flip(state, state.length - 1));
  });

  it("caractère du milieu altéré : invalid_state", async () => {
    await rejected((state) => flip(state, Math.floor(state.length / 2)));
  });

  it("premier caractère altéré : invalid_state", async () => {
    await rejected((state) => flip(state, 0));
  });

  it("état tronqué : invalid_state", async () => {
    await rejected((state) => state.slice(0, state.length - 8));
  });

  it("état dupliqué dans la requête (state=a&state=b) : invalid_state", async () => {
    const b = bench();
    const s = await installScene(b);
    const real = await startState(b, s.owner);
    const res = await callback(b.app, s.owner.cookie, [
      ["installation_id", s.github.externalId],
      ["code", `fake-code-${s.login}`],
      ["state", real],
      ["state", "autre"],
    ]);
    expectOutcome(res, "invalid_state");
    await expectNothingLinked(b.database, s.world.organizationId);
    expect(b.harness.callsOf("exchangeUserCode")).toEqual([]);
  });

  it("aucune entrée d'audit link_refused pour un état dont l'organisation n'est pas établie", async () => {
    const { b, s } = await rejected(() => "pas-un-etat");
    const actions = (await installationAudit(b.database, s.world.organizationId)).map(
      (a) => a.action,
    );
    expect(actions).toEqual(["installation.start"]);
  });
});

describe("état signé avec une autre clé ou sans ligne en base", () => {
  it("état produit par une application dont la clé est différente : invalid_state", async () => {
    const b = bench();
    const s = await installScene(b);
    const clock = new ManualClock();
    const foreignApp = await createInstallApp(
      b.database,
      await ProviderHarness.create(clock),
      clock,
      { encryptionKey: OTHER_ENCRYPTION_KEY },
    );
    try {
      const state = await startState({ ...b, app: foreignApp }, s.owner);
      const res = await callback(b.app, s.owner.cookie, githubReturn(s, state));
      expectOutcome(res, "invalid_state");
      await expectNothingLinked(b.database, s.world.organizationId);
      expect(b.harness.callsOf("exchangeUserCode")).toEqual([]);
    } finally {
      await foreignApp.close();
    }
  });

  it("signature valide mais ligne d'état absente de la base : invalid_state (la base est l'arbitre)", async () => {
    const b = bench();
    const s = await installScene(b);
    const state = await startState(b, s.owner);
    await b.database.query("DELETE FROM provider_auth_states WHERE organization_id = $1", [
      s.world.organizationId,
    ]);
    const res = await callback(b.app, s.owner.cookie, githubReturn(s, state));
    expectOutcome(res, "invalid_state");
    await expectNothingLinked(b.database, s.world.organizationId);
    expect(b.harness.callsOf("exchangeUserCode")).toEqual([]);
  });
});

describe("expiration (10 minutes)", () => {
  it("juste avant l'expiration : accepté", async () => {
    const b = bench();
    const s = await installScene(b);
    const state = await startState(b, s.owner);
    b.clock.advance(START_TTL_MS - 1000);
    expectOutcome(await callback(b.app, s.owner.cookie, githubReturn(s, state)), "installed");
  });

  it("après l'expiration : invalid_state, sans échange de code", async () => {
    const b = bench();
    const s = await installScene(b);
    const state = await startState(b, s.owner);
    b.clock.advance(START_TTL_MS + 1000);
    const res = await callback(b.app, s.owner.cookie, githubReturn(s, state));
    expectOutcome(res, "invalid_state");
    await expectNothingLinked(b.database, s.world.organizationId);
    expect(b.harness.callsOf("exchangeUserCode")).toEqual([]);
    expect((await stateRows(b.database, s.world.organizationId))[0]?.consumed_at).toBeNull();
  });
});

describe("rejeu", () => {
  it("un état déjà consommé est refusé, une seule ligne et un seul échange de code", async () => {
    const b = bench();
    const s = await installScene(b);
    const state = await startState(b, s.owner);
    expectOutcome(await callback(b.app, s.owner.cookie, githubReturn(s, state)), "installed");
    b.harness.inner.seedUserInstallation(s.login, s.github);

    const replay = await callback(b.app, s.owner.cookie, githubReturn(s, state));

    expectOutcome(replay, "invalid_state");
    expect(b.harness.callsOf("exchangeUserCode")).toHaveLength(1);
    expect(await stateRows(b.database, s.world.organizationId)).toHaveLength(1);
  });

  it("un état rejoué après un refus 'denied' reste inutilisable (consommé)", async () => {
    const b = bench();
    const s = await installScene(b);
    const state = await startState(b, s.owner);
    const first = await callback(
      b.app,
      s.owner.cookie,
      githubReturn(s, state, { code: undefined }),
    );
    expectOutcome(first, "denied");
    const second = await callback(b.app, s.owner.cookie, githubReturn(s, state));
    expectOutcome(second, "invalid_state");
    await expectNothingLinked(b.database, s.world.organizationId);
  });
});

describe("autre utilisateur, autre organisation, session absente", () => {
  it("état d'un autre utilisateur (même organisation) : invalid_state", async () => {
    const b = bench();
    const s = await installScene(b);
    const state = await startState(b, s.owner);
    const res = await callback(b.app, s.admin.cookie, githubReturn(s, state));
    expectOutcome(res, "invalid_state");
    await expectNothingLinked(b.database, s.world.organizationId);
    expect(b.harness.callsOf("exchangeUserCode")).toEqual([]);
  });

  it("état de la victime joué par un attaquant d'une autre organisation : invalid_state, rien chez l'attaquant ni la victime", async () => {
    const b = bench();
    const victim = await installScene(b);
    const attacker = await createWorld(b.database);
    const state = await startState(b, victim.owner);
    const res = await callback(b.app, attacker.actors.owner.cookie, githubReturn(victim, state));
    expectOutcome(res, "invalid_state");
    await expectNothingLinked(b.database, victim.world.organizationId);
    await expectNothingLinked(b.database, attacker.organizationId);
    expect(b.harness.callsOf("exchangeUserCode")).toEqual([]);
  });

  it("état de l'attaquant joué dans la session de la victime (CSRF classique) : invalid_state", async () => {
    const b = bench();
    const victim = await installScene(b);
    const attacker = await createWorld(b.database);
    const attackerState = await startState(b, attacker.actors.owner);
    const res = await callback(b.app, victim.owner.cookie, githubReturn(victim, attackerState));
    expectOutcome(res, "invalid_state");
    await expectNothingLinked(b.database, victim.world.organizationId);
    await expectNothingLinked(b.database, attacker.organizationId);
    expect(b.harness.callsOf("exchangeUserCode")).toEqual([]);
  });

  it("session absente : invalid_state (pas de 401, pas de redirection vers la connexion)", async () => {
    await rejected((state) => state, "anonymous");
  });

  it("cookie de session invalide : invalid_state", async () => {
    const b = bench();
    const s = await installScene(b);
    const state = await startState(b, s.owner);
    const res = await callback(
      b.app,
      "better-auth.session_token=forge.abc",
      githubReturn(s, state),
    );
    expectOutcome(res, "invalid_state");
    await expectNothingLinked(b.database, s.world.organizationId);
  });
});

import { GitAuthExpiredError, InvalidUserCodeError } from "@koklo/domain";
import { describe, expect, it } from "vitest";
import { InMemoryGitProvider } from "../src/testing/index.ts";

/** TK-48a1 : comportement propre au faux (`fake-code-<login>`, installations injectables, déterminisme). */
const REDIRECT = "https://app.koklo.test/api/github/callback";
const HOUR_MS = 60 * 60 * 1000;

function make(options: { appSlug?: string } = {}) {
  let ids = 0;
  let nowMs = Date.parse("2026-10-30T12:00:00.000Z");
  const provider = new InMemoryGitProvider({
    now: () => new Date(nowMs),
    nextId: () => String(++ids),
    ...options,
  });
  return {
    provider,
    advance: (ms: number) => {
      nowMs += ms;
    },
    nowMs: () => nowMs,
  };
}
const exchange = (provider: InMemoryGitProvider, login: string) =>
  provider.exchangeUserCode({ code: `fake-code-${login}`, redirectUri: REDIRECT });
const ADA = { externalId: "501", ownerKind: "user", ownerLogin: "ada" } as const;
const ACME = { externalId: "502", ownerKind: "organization", ownerLogin: "acme" } as const;

describe("InMemoryGitProvider.exchangeUserCode", () => {
  it("fake-code-<login> rend un jeton de 8 h avec rafraîchissement de 180 jours", async () => {
    const { provider, nowMs } = make();
    const credentials = await exchange(provider, "ada");
    expect(credentials.token.length).toBeGreaterThan(0);
    expect(credentials.expiresAt).toBe(new Date(nowMs() + 8 * HOUR_MS).toISOString());
    expect(credentials.refreshToken?.length).toBeGreaterThan(0);
    expect(credentials.refreshExpiresAt).toBe(new Date(nowMs() + 180 * 24 * HOUR_MS).toISOString());
  });

  it("est déterministe : deux instances identiques rendent les mêmes jetons", async () => {
    expect(await exchange(make().provider, "ada")).toEqual(await exchange(make().provider, "ada"));
  });

  it.each(["", "fake-code", "fake-code-", "autre-ada", "FAKE-CODE-ada"])(
    "code %j : InvalidUserCodeError",
    async (code) => {
      const { provider } = make();
      const error = await provider
        .exchangeUserCode({ code, redirectUri: REDIRECT })
        .catch((e: unknown) => e);
      expect(typeof InvalidUserCodeError).toBe("function");
      expect(error).toBeInstanceOf(InvalidUserCodeError);
    },
  );

  it("redirectUri vide : InvalidUserCodeError (le fournisseur compare l'URI enregistrée)", async () => {
    const { provider } = make();
    const error = await provider
      .exchangeUserCode({ code: "fake-code-ada", redirectUri: "" })
      .catch((e: unknown) => e);
    expect(typeof InvalidUserCodeError).toBe("function");
    expect(error).toBeInstanceOf(InvalidUserCodeError);
  });
});

describe("InMemoryGitProvider.listUserInstallations", () => {
  it("rend les installations injectées pour le compte du jeton, pas celles des autres", async () => {
    const { provider } = make();
    provider.seedUserInstallation("ada", ADA);
    provider.seedUserInstallation("grace", ACME);
    const creds = await exchange(provider, "ada");
    const listed = await provider.listUserInstallations({ auth: { kind: "user", ...creds } });
    expect(listed).toEqual([ADA]);
  });

  it("aucune installation injectée : tableau vide", async () => {
    const { provider } = make();
    const creds = await exchange(provider, "nobody");
    expect(await provider.listUserInstallations({ auth: { kind: "user", ...creds } })).toEqual([]);
  });

  it("plusieurs installations : toutes rendues, dans l'ordre d'injection", async () => {
    const { provider } = make();
    provider.seedUserInstallation("ada", ADA);
    provider.seedUserInstallation("ada", ACME);
    const creds = await exchange(provider, "ada");
    expect(await provider.listUserInstallations({ auth: { kind: "user", ...creds } })).toEqual([
      ADA,
      ACME,
    ]);
  });

  it("le jeton expire avec l'horloge : GitAuthExpiredError rafraîchissable", async () => {
    const { provider, advance } = make();
    provider.seedUserInstallation("ada", ADA);
    const creds = await exchange(provider, "ada");
    advance(9 * HOUR_MS);
    const error = await provider
      .listUserInstallations({ auth: { kind: "user", ...creds } })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(GitAuthExpiredError);
    expect(error).toMatchObject({ kind: "user", refreshable: true });
  });
});

describe("InMemoryGitProvider.appSlug", () => {
  it("défaut koklo-fake, remplaçable par l'option appSlug", async () => {
    expect(await make().provider.appSlug()).toBe("koklo-fake");
    expect(await make({ appSlug: "koklo-e2e" }).provider.appSlug()).toBe("koklo-e2e");
  });
});

describe("InMemoryGitProvider.getUserOwnerRole", () => {
  type Owner = { kind: "organization" | "user"; login: string };
  async function rolesOf(provider: InMemoryGitProvider, login: string) {
    const creds = await exchange(provider, login);
    return (owner: Owner) => provider.getUserOwnerRole({ auth: { kind: "user", ...creds }, owner });
  }
  const org = (login: string): Owner => ({ kind: "organization", login });

  it("seedOrgMembership : admin, member, pending (= none), sans lien (= none)", async () => {
    const { provider } = make();
    provider.seedOrgMembership("ada", "acme", "admin");
    provider.seedOrgMembership("ada", "beta", "member");
    provider.seedOrgMembership("ada", "gamma", "pending");
    const role = await rolesOf(provider, "ada");
    expect(await role(org("acme"))).toBe("admin");
    expect(await role(org("ACME"))).toBe("admin");
    expect(await role(org("beta"))).toBe("member");
    expect(await role(org("gamma"))).toBe("none");
    expect(await role(org("delta"))).toBe("none");
  });

  it("le rôle d'un compte n'est pas celui d'un autre", async () => {
    const { provider } = make();
    provider.seedOrgMembership("grace", "acme", "admin");
    expect(await (await rolesOf(provider, "ada"))(org("acme"))).toBe("none");
  });

  it("compte personnel : self pour son login seulement", async () => {
    const { provider } = make();
    const role = await rolesOf(provider, "ada");
    expect(await role({ kind: "user", login: "ada" })).toBe("self");
    expect(await role({ kind: "user", login: "grace" })).toBe("none");
  });
});

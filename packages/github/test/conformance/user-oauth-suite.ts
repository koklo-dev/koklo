/**
 * Conformité de `exchangeUserCode`, `listUserInstallations` et `appSlug` (TK-48a1, AC-48-01).
 * Fichier séparé de `suite.ts` (déjà au-delà de 300 lignes) ; un seul corps de tests, exécuté
 * contre le faux en mémoire et contre l'adaptateur Octokit sur transport simulé (CI), puis, à la
 * main, contre GitHub réel (NEEDS-HUMAN du ticket, même procédure que TK-39).
 */
import {
  GitAuthExpiredError,
  type GitProvider,
  GitProviderError,
  type GitUserInstallation,
  InvalidUserCodeError,
} from "@koklo/domain";
import { describe, expect, it } from "vitest";

/** Un consentement utilisateur : un code à usage unique et les installations qu'il rend visibles. */
export type UserGrant = {
  readonly code: string;
  readonly installations: readonly GitUserInstallation[];
};

export type UserOAuthContext = {
  readonly provider: GitProvider;
  readonly redirectUri: string;
  /** Fabrique un consentement neuf (code jamais utilisé). */
  readonly newGrant: () => Promise<UserGrant>;
  /** Un code que le fournisseur ne connaît pas. */
  readonly unknownCode: string;
};

export type UserOAuthFactory = () => Promise<UserOAuthContext>;

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("la promesse s'est résolue alors qu'une erreur typée était attendue");
}

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

export function runUserOAuthConformance(label: string, factory: UserOAuthFactory): void {
  describe(`GitProvider exchangeUserCode / listUserInstallations / appSlug : ${label}`, () => {
    it("exchangeUserCode rend un jeton utilisateur : chaîne non vide, expiration ISO UTC", async () => {
      const ctx = await factory();
      const grant = await ctx.newGrant();
      const credentials = await ctx.provider.exchangeUserCode({
        code: grant.code,
        redirectUri: ctx.redirectUri,
      });
      expect(typeof credentials.token).toBe("string");
      expect(credentials.token.length).toBeGreaterThan(0);
      expect(credentials.expiresAt).toMatch(ISO);
      if (credentials.refreshToken !== undefined) {
        expect(credentials.refreshToken.length).toBeGreaterThan(0);
        expect(credentials.refreshExpiresAt).toMatch(ISO);
      }
    });

    it("code inconnu : InvalidUserCodeError, sans le code dans le message", async () => {
      const ctx = await factory();
      const error = await rejection(
        ctx.provider.exchangeUserCode({ code: ctx.unknownCode, redirectUri: ctx.redirectUri }),
      );
      expect(typeof InvalidUserCodeError).toBe("function");
      expect(error).toBeInstanceOf(InvalidUserCodeError);
      expect(error).toMatchObject({ operation: "exchangeUserCode" });
      expect((error as Error).message).not.toContain(ctx.unknownCode);
    });

    it("un code ne s'échange qu'une fois : le rejeu est refusé", async () => {
      const ctx = await factory();
      const grant = await ctx.newGrant();
      const request = { code: grant.code, redirectUri: ctx.redirectUri };
      await ctx.provider.exchangeUserCode(request);
      const error = await rejection(ctx.provider.exchangeUserCode(request));
      expect(typeof InvalidUserCodeError).toBe("function");
      expect(error).toBeInstanceOf(InvalidUserCodeError);
    });

    it("listUserInstallations rend les installations du consentement, forme { externalId, ownerKind, ownerLogin }", async () => {
      const ctx = await factory();
      const grant = await ctx.newGrant();
      const credentials = await ctx.provider.exchangeUserCode({
        code: grant.code,
        redirectUri: ctx.redirectUri,
      });
      const listed = await ctx.provider.listUserInstallations({
        auth: { kind: "user", ...credentials },
      });
      expect(grant.installations.length).toBeGreaterThan(0);
      expect(listed).toEqual(expect.arrayContaining([...grant.installations]));
      for (const installation of listed) {
        expect(Object.keys(installation).sort()).toEqual(["externalId", "ownerKind", "ownerLogin"]);
        expect(typeof installation.externalId).toBe("string");
        expect(["organization", "user"]).toContain(installation.ownerKind);
        expect(installation.ownerLogin.length).toBeGreaterThan(0);
      }
    });

    it("listUserInstallations avec un jeton expiré ou inconnu : GitAuthExpiredError (kind user)", async () => {
      const ctx = await factory();
      const error = await rejection(
        ctx.provider.listUserInstallations({
          auth: { kind: "user", token: "pas-un-jeton", expiresAt: "2020-01-01T00:00:00.000Z" },
        }),
      );
      expect(error).toBeInstanceOf(GitAuthExpiredError);
      expect(error).toMatchObject({ kind: "user" });
    });

    it("listUserInstallations avec un jeton d'installation : refusé (jeton utilisateur exigé)", async () => {
      const ctx = await factory();
      const error = await rejection(
        ctx.provider.listUserInstallations({
          auth: { kind: "installation", token: "iat", expiresAt: "2099-01-01T00:00:00.000Z" },
        }),
      );
      expect(error).toBeInstanceOf(GitProviderError);
      expect(error).toMatchObject({ operation: "listUserInstallations" });
    });

    it("appSlug rend un identifiant d'URL non vide et stable", async () => {
      const ctx = await factory();
      const first = await ctx.provider.appSlug();
      expect(first).toMatch(/^[A-Za-z0-9][A-Za-z0-9-]*$/);
      expect(await ctx.provider.appSlug()).toBe(first);
    });
  });
}

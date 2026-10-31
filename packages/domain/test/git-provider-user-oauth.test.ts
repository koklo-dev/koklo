import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, expectTypeOf, it } from "vitest";
import type {
  GitAuth,
  GitProvider,
  GitUserCredentials,
  GitUserInstallation,
} from "../src/index.ts";
import * as domain from "../src/index.ts";

/**
 * TK-48a1 AC-48-01 : le port gagne l'échange `code -> jeton utilisateur`, la lecture des
 * installations visibles du jeton et l'identifiant d'URL de l'App (ADR 0009). Changement additif.
 */
const src = (file: string) => readFileSync(resolve(import.meta.dirname, "../src", file), "utf8");

describe("TK-48 port : exchangeUserCode, listUserInstallations, appSlug", () => {
  it("exchangeUserCode({ code, redirectUri }) -> Promise<GitUserCredentials>", () => {
    expectTypeOf<Parameters<GitProvider["exchangeUserCode"]>[0]>().toEqualTypeOf<{
      code: string;
      redirectUri: string;
    }>();
    expectTypeOf<ReturnType<GitProvider["exchangeUserCode"]>>().toEqualTypeOf<
      Promise<GitUserCredentials>
    >();
  });

  it("listUserInstallations({ auth }) -> installations { externalId, ownerKind, ownerLogin }", () => {
    expectTypeOf<Parameters<GitProvider["listUserInstallations"]>[0]>().toEqualTypeOf<{
      auth: GitAuth;
    }>();
    expectTypeOf<GitUserInstallation>().toEqualTypeOf<{
      readonly externalId: string;
      readonly ownerKind: "organization" | "user";
      readonly ownerLogin: string;
    }>();
    expectTypeOf<ReturnType<GitProvider["listUserInstallations"]>>().toEqualTypeOf<
      Promise<readonly GitUserInstallation[]>
    >();
  });

  it("appSlug() -> Promise<string>", () => {
    expectTypeOf<ReturnType<GitProvider["appSlug"]>>().toEqualTypeOf<Promise<string>>();
  });

  it("documente InvalidUserCodeError sur exchangeUserCode et GitAuthExpiredError sur la liste", () => {
    const port = src("git-provider.ts");
    expect(port).toMatch(/@throws InvalidUserCodeError[\s\S]*?exchangeUserCode\(/);
    expect(port).toMatch(/@throws GitAuthExpiredError\s*\*\/\s*listUserInstallations\(/);
  });
});

describe("TK-48 InvalidUserCodeError", () => {
  const ErrorClass = (domain as Record<string, unknown>).InvalidUserCodeError as
    | (new (input: {
        operation: string;
      }) => domain.GitProviderError)
    | undefined;

  it("est exportée par le domaine", () => {
    expect(typeof ErrorClass).toBe("function");
  });

  it("étend GitProviderError, nomme l'opération et ne porte aucune donnée reçue", () => {
    expect(typeof ErrorClass).toBe("function");
    const error = new (ErrorClass as NonNullable<typeof ErrorClass>)({
      operation: "exchangeUserCode",
    });
    expect(error).toBeInstanceOf(domain.GitProviderError);
    expect(error.name).toBe("InvalidUserCodeError");
    expect(error.operation).toBe("exchangeUserCode");
    expect(Object.keys(error).sort()).toEqual(["name", "operation"].sort());
  });
});

import { randomBytes } from "node:crypto";
import { Test } from "@nestjs/testing";
import { afterEach, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module.ts";
import type { AppConfig } from "../src/config.ts";
import { PrismaUserCredentials } from "../src/repo/prisma-user-credentials.ts";
import { NoUserCredentials, USER_CREDENTIALS } from "../src/repo/tokens.ts";
import { configFor, UNREACHABLE_DATABASE_URL } from "./helpers/app.ts";

/**
 * TK-48a1 AC-48-03/04 : le magasin des jetons utilisateur n'est branché que si l'App a ses
 * identifiants client ET que la clé de chiffrement est fournie ; sinon l'API garde
 * `NoUserCredentials` (USER_TOKEN_REQUIRED, repli repo.link) et démarre normalement.
 */
const base = (): AppConfig =>
  configFor({ databaseUrl: UNREACHABLE_DATABASE_URL, appVersion: "dev", appEnv: "test" });
const app = { appId: "1", privateKey: "pem" };
const client = { ...app, clientId: "Iv1.x", clientSecret: "secret" };
const encryptionKey = randomBytes(32);

const opened: Array<{ close: () => Promise<void> }> = [];
afterEach(async () => {
  await Promise.all(opened.splice(0).map((module) => module.close()));
});

async function storeFor(config: AppConfig): Promise<unknown> {
  const module = await Test.createTestingModule({ imports: [AppModule.forRoot(config)] }).compile();
  opened.push(module);
  return module.get(USER_CREDENTIALS);
}

describe("câblage de USER_CREDENTIALS", () => {
  it("App avec identifiants client + clé : PrismaUserCredentials", async () => {
    const store = await storeFor({ ...base(), githubApp: client, encryptionKey });
    expect(store).toBeInstanceOf(PrismaUserCredentials);
  });

  it.each([
    ["aucune App, aucune clé", {}],
    ["clé seule", { encryptionKey }],
    ["App sans identifiants client, avec clé", { githubApp: app, encryptionKey }],
  ])("%s : NoUserCredentials", async (_label, extra) => {
    const store = await storeFor({ ...base(), ...extra });
    expect(store).toBeInstanceOf(NoUserCredentials);
  });
});

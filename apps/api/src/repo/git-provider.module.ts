import { createOctokitGitProvider } from "@koklo/github";
import { type DynamicModule, Global, Module } from "@nestjs/common";
import { CLOCK, type Clock } from "../clock.ts";
import type { AppConfig } from "../config.ts";
import { createTokenCipher } from "../crypto/token-cipher.ts";
import { DatabaseService } from "../database/database.module.ts";
import { requestLogger } from "../request-logger.ts";
import { PrismaUserCredentials } from "./prisma-user-credentials.ts";
import {
  GIT_PROVIDER,
  type GitProviderBinding,
  NoUserCredentials,
  USER_CREDENTIALS,
  type UserCredentialsStore,
} from "./tokens.ts";

/**
 * Fournisseur git de l'API : l'adaptateur Octokit si l'App GitHub est configurée (ID + clé ; les identifiants client sont facultatifs), sinon `null`
 * (un seul avertissement au démarrage, sans valeur). Le faux n'est jamais choisi par la
 * configuration : les tests l'injectent par `overrideProvider(GIT_PROVIDER)`.
 */
function providerOf(config: AppConfig, clock: Clock): GitProviderBinding {
  const app = config.githubApp;
  if (!app) {
    requestLogger().warn(
      "GITHUB_APP_ID et GITHUB_APP_PRIVATE_KEY absentes : fournisseur git non configuré, repo.createSpec et repo.link répondront PROVIDER_UNAVAILABLE",
    );
    return null;
  }
  return createOctokitGitProvider({ ...app, now: () => new Date(clock.now()) });
}

/**
 * Les jetons utilisateur ne sont conservés que si l'App a ses identifiants client (sans eux aucun
 * jeton ne peut être obtenu) ET que la clé de chiffrement est fournie ; sinon `NoUserCredentials`.
 */
function credentialsOf(config: AppConfig, database: DatabaseService): UserCredentialsStore {
  const { githubApp, encryptionKey } = config;
  const hasClient = githubApp?.clientId !== undefined && githubApp.clientSecret !== undefined;
  return hasClient && encryptionKey !== undefined
    ? new PrismaUserCredentials(database, createTokenCipher(encryptionKey))
    : new NoUserCredentials();
}

@Global()
@Module({})
export class GitProviderModule {
  static forRoot(config: AppConfig): DynamicModule {
    return {
      module: GitProviderModule,
      providers: [
        {
          provide: GIT_PROVIDER,
          inject: [CLOCK],
          useFactory: (clock: Clock) => providerOf(config, clock),
        },
        {
          provide: USER_CREDENTIALS,
          inject: [DatabaseService],
          useFactory: (database: DatabaseService) => credentialsOf(config, database),
        },
      ],
      exports: [GIT_PROVIDER, USER_CREDENTIALS],
    };
  }
}

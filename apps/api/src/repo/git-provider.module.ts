import { createOctokitGitProvider } from "@koklo/github";
import { type DynamicModule, Global, Module } from "@nestjs/common";
import { CLOCK, type Clock } from "../clock.ts";
import type { AppConfig } from "../config.ts";
import { requestLogger } from "../request-logger.ts";
import {
  GIT_PROVIDER,
  type GitProviderBinding,
  NoUserCredentials,
  USER_CREDENTIALS,
} from "./tokens.ts";

/**
 * Fournisseur git de l'API : l'adaptateur Octokit si l'App GitHub est configurée, sinon `null`
 * (un seul avertissement au démarrage, sans valeur). Le faux n'est jamais choisi par la
 * configuration : les tests l'injectent par `overrideProvider(GIT_PROVIDER)`.
 */
function providerOf(config: AppConfig, clock: Clock): GitProviderBinding {
  const app = config.githubApp;
  if (!app) {
    requestLogger().warn(
      "GITHUB_APP_* absentes : fournisseur git non configuré, repo.createSpec et repo.link répondront PROVIDER_UNAVAILABLE",
    );
    return null;
  }
  return createOctokitGitProvider({ ...app, now: () => new Date(clock.now()) });
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
        { provide: USER_CREDENTIALS, useClass: NoUserCredentials },
      ],
      exports: [GIT_PROVIDER, USER_CREDENTIALS],
    };
  }
}

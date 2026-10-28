import { type DynamicModule, Global, Module, type Provider } from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";
import type { AppConfig } from "../config.ts";
import { DatabaseService } from "../database/database.module.ts";
import { AuthController } from "./auth.controller.ts";
import { AUTH } from "./auth.tokens.ts";
import { type Auth, createAuth } from "./auth.ts";
import { BetterAuthSessionResolver } from "./better-auth-session.resolver.ts";
import { OrpcErrorFilter } from "./orpc-error.filter.ts";
import { SESSION_RESOLVER } from "./session.ts";
import {
  TEST_SESSION_RESOLVER,
  TestFirstSessionResolver,
  TestSessionResolver,
} from "./test-session.ts";

function sessionProviders(config: AppConfig): Provider[] {
  const real: Provider = {
    provide: BetterAuthSessionResolver,
    inject: [AUTH, DatabaseService],
    useFactory: (auth: Auth, database: DatabaseService) =>
      new BetterAuthSessionResolver(auth, database.raw),
  };
  if (config.appEnv !== "test") {
    return [real, { provide: SESSION_RESOLVER, useExisting: BetterAuthSessionResolver }];
  }
  // La session de test n'existe que dans ce module-ci, et seulement en environnement de test.
  return [
    real,
    { provide: TEST_SESSION_RESOLVER, useClass: TestSessionResolver },
    {
      provide: SESSION_RESOLVER,
      inject: [TEST_SESSION_RESOLVER, BetterAuthSessionResolver],
      useFactory: (test: TestSessionResolver, resolver: BetterAuthSessionResolver) =>
        new TestFirstSessionResolver(test, resolver),
    },
  ];
}

@Global()
@Module({})
export class AuthModule {
  static forRoot(config: AppConfig): DynamicModule {
    return {
      module: AuthModule,
      controllers: [AuthController],
      providers: [
        {
          provide: AUTH,
          inject: [DatabaseService],
          useFactory: (database: DatabaseService) => createAuth(config, database.raw),
        },
        { provide: APP_FILTER, useClass: OrpcErrorFilter },
        ...sessionProviders(config),
      ],
      exports: [SESSION_RESOLVER],
    };
  }
}

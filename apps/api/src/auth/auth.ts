import type { PrismaClient } from "@koklo/db";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { organization } from "better-auth/plugins";
import type { AppConfig } from "../config.ts";

/**
 * Instance Better Auth : GitHub OAuth, adaptateur Prisma sur le client partagé (un seul pool),
 * plugin `organization` (organisation active portée par la session).
 */
export function createAuth(config: AppConfig, prisma: PrismaClient) {
  return betterAuth({
    appName: "koklo",
    baseURL: config.betterAuthUrl,
    secret: config.betterAuthSecret,
    trustedOrigins: [config.betterAuthUrl],
    database: prismaAdapter(prisma, { provider: "postgresql" }),
    // Les identifiants du schéma sont des UUID (@db.Uuid).
    advanced: { database: { generateId: "uuid" } },
    socialProviders: {
      github: { clientId: config.githubClientId, clientSecret: config.githubClientSecret },
    },
    plugins: [organization()],
  });
}

export type Auth = ReturnType<typeof createAuth>;

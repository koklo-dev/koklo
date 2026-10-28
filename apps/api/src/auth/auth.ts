import type { PrismaClient } from "@koklo/db";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { magicLink, organization } from "better-auth/plugins";
import type { AppConfig } from "../config.ts";
import type { EnqueueMagicLink } from "./magic-link-queue.ts";

/** Durée de vie du lien (secondes) : 10 minutes au plus, usage unique. */
export const MAGIC_LINK_EXPIRES_IN = 600;

/**
 * Instance Better Auth : GitHub OAuth, adaptateur Prisma sur le client partagé (un seul pool),
 * plugin `organization` (organisation active portée par la session), lien magique : le jeton est
 * stocké haché, les comptes se créent par invitation (pas d'inscription par lien) et l'envoi est
 * délégué au worker via `enqueueMagicLink`.
 */
export function createAuth(
  config: AppConfig,
  prisma: PrismaClient,
  enqueueMagicLink: EnqueueMagicLink,
) {
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
    plugins: [
      organization(),
      magicLink({
        expiresIn: MAGIC_LINK_EXPIRES_IN,
        storeToken: "hashed",
        disableSignUp: true,
        sendMagicLink: ({ email, url }) => enqueueMagicLink({ email, url }),
      }),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;

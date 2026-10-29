import type { PrismaClient } from "@koklo/db";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { magicLink, organization } from "better-auth/plugins";
import type { AppConfig } from "../config.ts";
import type { EnqueueInvitation } from "../organization/invitation-queue.ts";
import type { EnqueueMagicLink } from "./magic-link-queue.ts";
import { organizationAccessControl, organizationRoles } from "./roles.ts";

/** Durée de vie du lien (secondes) : 10 minutes au plus, usage unique. */
export const MAGIC_LINK_EXPIRES_IN = 600;

/** Durée de vie d'une invitation (secondes) : 7 jours. */
export const INVITATION_EXPIRES_IN = 604_800;

/** Lien d'acceptation envoyé par email ; la page vit dans le web. */
export function invitationUrl(baseUrl: string, invitationId: string): string {
  return `${baseUrl.replace(/\/$/, "")}/accept-invitation/${invitationId}`;
}

/**
 * Instance Better Auth : GitHub OAuth, adaptateur Prisma sur le client partagé (un seul pool),
 * plugin `organization` (6 rôles du CDC §14, organisation active portée par la session, invitation
 * remise au worker via `enqueueInvitation`), lien magique : le jeton est
 * stocké haché, les comptes se créent par invitation (pas d'inscription par lien) et l'envoi est
 * délégué au worker via `enqueueMagicLink`.
 */
export function createAuth(
  config: AppConfig,
  prisma: PrismaClient,
  enqueueMagicLink: EnqueueMagicLink,
  enqueueInvitation: EnqueueInvitation,
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
      organization({
        ac: organizationAccessControl,
        roles: organizationRoles,
        invitationExpiresIn: INVITATION_EXPIRES_IN,
        // Une invitation pending (même expirée) est remplacée ; les doublons vivants sont refusés
        // en amont par le service (409 already_invited).
        cancelPendingInvitationsOnReInvite: true,
        sendInvitationEmail: ({ id, email, role, organization, inviter }) =>
          enqueueInvitation({
            email,
            url: invitationUrl(config.betterAuthUrl, id),
            inviterName: inviter.user.name,
            organizationName: organization.name,
            role,
          }),
      }),
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

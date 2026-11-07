import {
  authErrors,
  conflictOf,
  internalError,
  unauthorizedError,
  validationError,
} from "./errors.ts";
import { route, writeOneErrors } from "./route-helpers.ts";
import {
  invitationCreateInputSchema,
  invitationIdInputSchema,
  invitationListOutputSchema,
  invitationRevokeOutputSchema,
  invitationSchema,
  memberPageInputSchema,
  memberPageOutputSchema,
  memberRemoveInputSchema,
  memberRemoveOutputSchema,
  memberUpdateRoleInputSchema,
  memberUpdateRoleOutputSchema,
  meNotificationsOutputSchema,
  meOutputSchema,
  meUpdateInputSchema,
  meUpdateNotificationInputSchema,
  meUpdateNotificationOutputSchema,
  orgGetOutputSchema,
  orgUpdateInputSchema,
  orgUpdateOutputSchema,
} from "./schemas-settings.ts";

/**
 * Réglages (TK-97, contrat 2.2.0) : Général, Membres, Mon compte. Droits vérifiés côté serveur
 * (docs/api-contract.md, table des droits) : `org.get` aux membres hors client, les écritures de
 * gestion aux propriétaires et administrateurs, `me.*` à toute session.
 */
export const org = {
  get: route("GET", "/organization")
    .errors({ ...internalError, ...authErrors })
    .output(orgGetOutputSchema),
  update: route("PATCH", "/organization")
    .errors({ ...internalError, ...authErrors, ...conflictOf("slug_taken"), ...validationError })
    .input(orgUpdateInputSchema)
    .output(orgUpdateOutputSchema),
};

export const invitation = {
  create: route("POST", "/invitations")
    .errors({
      ...writeOneErrors,
      ...conflictOf("already_member", "already_invited"),
      ...validationError,
    })
    .input(invitationCreateInputSchema)
    .output(invitationSchema),
  list: route("GET", "/invitations")
    .errors({ ...internalError, ...authErrors })
    .output(invitationListOutputSchema),
  resend: route("POST", "/invitations/{invitationId}/resend")
    .errors({ ...writeOneErrors, ...validationError })
    .input(invitationIdInputSchema)
    .output(invitationSchema),
  revoke: route("DELETE", "/invitations/{invitationId}")
    .errors({ ...writeOneErrors, ...validationError })
    .input(invitationIdInputSchema)
    .output(invitationRevokeOutputSchema),
};

/** Rejoint le groupe `member` (à côté des routes dépréciées `invite`, `setRole`, `list`). */
export const memberSettings = {
  page: route("GET", "/members/page")
    .errors({ ...internalError, ...authErrors, ...validationError })
    .input(memberPageInputSchema)
    .output(memberPageOutputSchema),
  updateRole: route("PATCH", "/members/{memberId}")
    .errors({
      ...writeOneErrors,
      ...conflictOf("self_role", "last_owner"),
      ...validationError,
    })
    .input(memberUpdateRoleInputSchema)
    .output(memberUpdateRoleOutputSchema),
  remove: route("DELETE", "/members/{memberId}")
    .errors({
      ...writeOneErrors,
      ...conflictOf("self_remove", "last_owner"),
      ...validationError,
    })
    .input(memberRemoveInputSchema)
    .output(memberRemoveOutputSchema),
};

const meErrors = { ...internalError, ...unauthorizedError } as const;

export const me = {
  get: route("GET", "/me").errors(meErrors).output(meOutputSchema),
  update: route("PATCH", "/me")
    .errors({ ...meErrors, ...validationError })
    .input(meUpdateInputSchema)
    .output(meOutputSchema),
  getNotifications: route("GET", "/me/notifications")
    .errors(meErrors)
    .output(meNotificationsOutputSchema),
  updateNotification: route("PUT", "/me/notifications/{key}")
    .errors({ ...meErrors, ...validationError })
    .input(meUpdateNotificationInputSchema)
    .output(meUpdateNotificationOutputSchema),
};

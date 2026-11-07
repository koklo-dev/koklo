import {
  CLIENT_NOTIFICATION_KEYS,
  type MeNotificationsOutput,
  type MeOutput,
  type NotificationPreferenceKey,
  roleSchema,
  TEAM_NOTIFICATION_KEYS,
} from "@koklo/contract";
import { Inject, Injectable } from "@nestjs/common";
import { ORPCError } from "@orpc/server";
import { CLIENT_ROLE } from "../auth/roles.ts";
import type { AuthSession } from "../auth/session.ts";
import { MeRepository, type UserProfile } from "./me.repository.ts";

/** Le rôle vient de la session (relu dans `members`) ; un rôle inconnu n'a pas de profil (fail-closed). */
function profileOf(session: AuthSession, user: UserProfile): MeOutput {
  const role = roleSchema.safeParse(session.role);
  if (!role.success) {
    throw new ORPCError("FORBIDDEN", { message: "Accès refusé" });
  }
  return { id: user.id, name: user.name, email: user.email, role: role.data };
}

@Injectable()
export class MeService {
  constructor(@Inject(MeRepository) private readonly repository: MeRepository) {}

  async get(session: AuthSession): Promise<MeOutput> {
    return profileOf(session, await this.repository.profile(session.userId));
  }

  async update(session: AuthSession, name: string): Promise<MeOutput> {
    return profileOf(session, await this.repository.updateName(session, name));
  }

  /** Le client reçoit ses trois clés, les autres rôles les cinq clés d'équipe (B101). */
  notifications(session: AuthSession): Promise<MeNotificationsOutput> {
    const keys = session.role === CLIENT_ROLE ? CLIENT_NOTIFICATION_KEYS : TEAM_NOTIFICATION_KEYS;
    return this.repository.notifications(session, keys);
  }

  setNotification(session: AuthSession, key: NotificationPreferenceKey, enabled: boolean) {
    return this.repository.setNotification(session, key, enabled);
  }
}

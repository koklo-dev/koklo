import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  type MeNotificationsOutput,
  type NotificationPreferenceKey,
} from "@koklo/contract";
import { withOrganization } from "@koklo/db";
import { Inject, Injectable } from "@nestjs/common";
import { DatabaseService } from "../database/database.module.ts";
import { type AuditActor, recordAudit } from "../tracker/audit.ts";

export interface UserProfile {
  id: string;
  name: string;
  email: string;
}

/** Compte et préférences de la session : le compte est global (hors filtre), les préférences sont par organisation. */
@Injectable()
export class MeRepository {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  profile(userId: string): Promise<UserProfile> {
    return this.database.client.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, name: true, email: true },
    });
  }

  /** Nom seulement (jamais l'e-mail) et audit `me.update` dans la même transaction. */
  updateName(actor: AuditActor, name: string): Promise<UserProfile> {
    return withOrganization(actor.organizationId, () =>
      this.database.client.$transaction(async (tx) => {
        const updated = await tx.user.update({
          where: { id: actor.userId },
          data: { name },
          select: { id: true, name: true, email: true },
        });
        await recordAudit(tx, actor, {
          action: "me.update",
          targetKind: "user",
          targetId: actor.userId,
        });
        return updated;
      }),
    );
  }

  /** Préférences des `keys` : la ligne si elle existe, sinon la valeur par défaut du contrat. */
  async notifications(
    actor: AuditActor,
    keys: readonly NotificationPreferenceKey[],
  ): Promise<MeNotificationsOutput> {
    const rows = await withOrganization(actor.organizationId, () =>
      this.database.client.notificationPreference.findMany({
        where: { userId: actor.userId, key: { in: [...keys] } },
        select: { key: true, enabled: true },
      }),
    );
    const stored = new Map(rows.map((row) => [row.key, row.enabled]));
    return keys.map((key) => ({
      key,
      enabled: stored.get(key) ?? DEFAULT_NOTIFICATION_PREFERENCES[key],
    }));
  }

  /** Une ligne par (utilisateur, organisation, clé) ; l'audit `me.notifications.update` vise cette ligne. */
  setNotification(
    actor: AuditActor,
    key: NotificationPreferenceKey,
    enabled: boolean,
  ): Promise<{ key: NotificationPreferenceKey; enabled: boolean }> {
    const { organizationId, userId } = actor;
    return withOrganization(organizationId, () =>
      this.database.client.$transaction(async (tx) => {
        const row = await tx.notificationPreference.upsert({
          where: { userId_organizationId_key: { userId, organizationId, key } },
          create: { organizationId, userId, key, enabled },
          update: { enabled },
          select: { id: true },
        });
        await recordAudit(tx, actor, {
          action: "me.notifications.update",
          targetKind: "notification_preference",
          targetId: row.id,
        });
        return { key, enabled };
      }),
    );
  }
}

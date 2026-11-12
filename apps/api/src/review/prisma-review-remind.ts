import type { NotificationEmitter } from "../notification/notification-emitter.ts";
import { conflict } from "../tracker/api-errors.ts";
import { recordAudit } from "../tracker/audit.ts";
import type { Tx } from "../tracker/project-transactions.ts";
import type { ProjectScope } from "../tracker/scope.ts";
import type { RemindedClients } from "./review.repository.ts";

/**
 * Relance du client (B352), dans la transaction de l'appel : une notification par client lié et par jour, un audit par
 * client réellement relancé (aucun pour un rejeu du même jour). Le droit (owner, admin) est vérifié par le garde de route ;
 * sans client invité, `no_client`.
 */
export async function remindClients(
  tx: Tx,
  notifications: NotificationEmitter,
  scope: ProjectScope,
  now: Date,
): Promise<RemindedClients> {
  const links = await tx.projectClientAccess.findMany({
    where: { projectId: scope.projectId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true, userId: true },
  });
  if (links.length === 0) throw conflict("no_client");
  const fresh = await notifications.reviewReminded(
    tx,
    scope,
    links,
    now.toISOString().slice(0, 10),
  );
  for (const link of fresh) {
    await recordAudit(tx, scope, {
      action: "review.remind",
      targetKind: "project_client",
      targetId: link.id,
    });
  }
  return { reminded: fresh.length };
}

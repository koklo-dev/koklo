import { type TenantClient, withOrganization } from "@koklo/db";
import type { TargetStore } from "./target-store.ts";
import { type DeliveryOutcome, type InstallationJob, ignored, processed } from "./types.ts";

type Status = "active" | "suspended" | "deleted";

/** Action du webhook -> nouveau statut et action d'audit système. */
const TRANSITIONS: Readonly<Record<string, { status: Status; audit: string }>> = {
  suspend: { status: "suspended", audit: "provider.installation.suspended" },
  unsuspend: { status: "active", audit: "provider.installation.reactivated" },
  deleted: { status: "deleted", audit: "provider.installation.deleted" },
};

export interface InstallationDeps {
  readonly targets: TargetStore;
  readonly client: TenantClient;
}

/**
 * Traite un événement `installation`. Seules les installations déjà connues changent de statut : la
 * ligne est créée par le flux d'autorisation (organisation inconnue d'un webhook), jamais ici.
 * `deleted` est terminal. Le statut, l'audit système et, pour `deleted`, l'effacement des
 * livraisons de l'installation (hors la courante, qui sert au dédoublonnage) sont UNE transaction.
 */
export async function handleInstallation(
  deps: InstallationDeps,
  job: InstallationJob,
  deliveryId: string,
): Promise<DeliveryOutcome> {
  if (job.action === "created") return ignored("unknown_installation");
  const installation = await deps.targets.installation(job.installationId);
  if (!installation) return ignored("unknown_installation");
  const transition = TRANSITIONS[job.action];
  if (transition === undefined || installation.status === "deleted") return ignored();
  if (installation.status === transition.status) return processed();
  await withOrganization(installation.organizationId, () =>
    deps.client.$transaction(async (tx) => {
      await tx.providerInstallation.updateMany({
        where: { id: installation.id },
        data: { status: transition.status },
      });
      await tx.auditLog.create({
        data: {
          organizationId: installation.organizationId,
          actorKind: "system",
          action: transition.audit,
          targetKind: "provider_installation",
          targetId: installation.id,
        },
      });
      if (transition.status === "deleted") {
        // Seul accès à `webhook_deliveries` hors du client brut : modèle exclu du filtre tenant, et
        // même transaction que le statut (tout ou rien). Borné à CETTE installation et à github.
        await tx.webhookDelivery.deleteMany({
          where: {
            provider: "github",
            installationExternalId: installation.externalId,
            id: { not: deliveryId },
          },
        });
      }
    }),
  );
  return processed();
}

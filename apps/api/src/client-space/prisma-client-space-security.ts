import type { IncidentContact } from "@koklo/contract";
import { Inject, Injectable } from "@nestjs/common";
import { recordAudit } from "../tracker/audit.ts";
import { ProjectTransactions } from "../tracker/project-transactions.ts";
import type { ProjectScope } from "../tracker/scope.ts";

/** Écritures et dates de la vue client de la Sécurité (TK-117, B801) : le contact vit en base seulement. */
@Injectable()
export class PrismaClientSpaceSecurity {
  constructor(@Inject(ProjectTransactions) private readonly transactions: ProjectTransactions) {}

  /** Date de la dernière approbation du livrable Sécurité. */
  async validatedAt(scope: ProjectScope): Promise<Date | null> {
    const review = await this.transactions.run(scope, (tx) =>
      tx.review.findFirst({
        where: {
          projectId: scope.projectId,
          targetKind: "deliverable",
          targetRef: "security",
          status: "approved",
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: { createdAt: true },
      }),
    );
    return review?.createdAt ?? null;
  }

  /** Un contact par projet ; l'audit, dans la même transaction, ne porte ni le nom ni le numéro. */
  setContact(scope: ProjectScope, { name, phone }: IncidentContact): Promise<IncidentContact> {
    return this.transactions.run(scope, async (tx) => {
      const values = { name, phone, updatedBy: scope.userId };
      await tx.projectIncidentContact.upsert({
        where: { projectId: scope.projectId },
        create: {
          ...values,
          organizationId: scope.organizationId,
          projectId: scope.projectId,
        },
        update: values,
      });
      await recordAudit(tx, scope, {
        action: "security.contact.set",
        targetKind: "project",
        targetId: scope.projectId,
      });
      return { name, phone };
    });
  }
}

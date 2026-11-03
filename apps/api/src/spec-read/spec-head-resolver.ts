import { Injectable } from "@nestjs/common";
import { carrierFilter } from "../repo/prisma-repo.repository.ts";
import type { Tx } from "../tracker/project-transactions.ts";
import type { ProjectScope } from "../tracker/scope.ts";
import type { Revision } from "./spec-read.repository.ts";

/** Branche de travail de la spec (cadrage), lue avant la branche par défaut du dépôt. */
const WORKING_BRANCH = "cadrage";

export type Snapshot = NonNullable<Awaited<ReturnType<Tx["specSnapshot"]["findFirst"]>>>;

export interface Resolved {
  repo: NonNullable<Awaited<ReturnType<Tx["projectRepo"]["findFirst"]>>>;
  branch: string;
  snapshot: Snapshot;
}

const carrierRepo = (tx: Tx, scope: ProjectScope) =>
  tx.projectRepo.findFirst({ where: { projectId: scope.projectId, ...carrierFilter } });

const headOf = (tx: Tx, repoId: string, branch: string) =>
  tx.specHead.findFirst({ where: { repoId, branch }, include: { snapshot: true } });

/**
 * Résolveur de la tête de spec, partagé par `spec.*` et `clientSpace.*` (TK-55b) : une seule
 * définition de la branche de travail et de la résolution d'une révision.
 */
@Injectable()
export class SpecHeadResolver {
  /**
   * Instantané de la révision et sa branche (`""` quand un `commitSha` n'est pointé par aucune).
   * Un `commitSha` pointé par plusieurs branches rend la première par ordre alphabétique
   * (déterministe). Le statut `building` n'est jamais écrit par le worker (instantané créé
   * directement `ready|failed`) : il est lu comme `ready` et `head` le rend tel que stocké.
   */
  async resolve(tx: Tx, scope: ProjectScope, revision: Revision): Promise<Resolved | null> {
    const repo = await carrierRepo(tx, scope);
    if (!repo) return null;
    if (revision.commitSha !== undefined) {
      const snapshot = await tx.specSnapshot.findFirst({
        where: { repoId: repo.id, commitSha: revision.commitSha },
      });
      if (!snapshot) return null;
      const pointing = await tx.specHead.findFirst({
        where: { repoId: repo.id, snapshotId: snapshot.id },
        orderBy: { branch: "asc" },
      });
      return { repo, snapshot, branch: pointing?.branch ?? "" };
    }
    const branches =
      revision.branch === undefined ? [WORKING_BRANCH, repo.defaultBranch] : [revision.branch];
    for (const branch of branches) {
      const head = await headOf(tx, repo.id, branch);
      if (head) return { repo, snapshot: head.snapshot, branch };
    }
    return null;
  }
}

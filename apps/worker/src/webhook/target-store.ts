import { type PrismaClient, type TenantClient, withOrganization } from "@koklo/db";
import type { Target } from "./types.ts";

/** Installation telle que lue en base (colonnes utiles seulement). */
export type InstallationRow = Target["installation"];

export type Resolution =
  | { readonly kind: "unknown-installation" }
  | { readonly kind: "unknown-repo" }
  | { readonly kind: "found"; readonly target: Target };

/**
 * Résolution installation -> dépôt -> organisation. Les identifiants externes viennent d'une charge
 * signée mais c'est la base qui décide : un dépôt rattaché à une AUTRE installation est inconnu.
 * Lectures par le client brut (l'organisation n'est connue qu'à l'issue de la lecture).
 */
export class TargetStore {
  private readonly raw: PrismaClient;
  private readonly client: TenantClient;
  constructor(raw: PrismaClient, client: TenantClient) {
    this.raw = raw;
    this.client = client;
  }

  async installation(externalId: string): Promise<InstallationRow | null> {
    return this.raw.providerInstallation.findUnique({
      where: { provider_externalId: { provider: "github", externalId } },
      select: {
        id: true,
        organizationId: true,
        externalId: true,
        status: true,
        ownerKind: true,
        ownerLogin: true,
      },
    });
  }

  async resolve(installationId: string, repositoryId: string): Promise<Resolution> {
    const installation = await this.installation(installationId);
    if (!installation) return { kind: "unknown-installation" };
    const repo = await this.raw.projectRepo.findUnique({
      where: {
        installationId_externalId: { installationId: installation.id, externalId: repositoryId },
      },
    });
    if (!repo) return { kind: "unknown-repo" };
    return {
      kind: "found",
      target: {
        installation,
        repo: {
          id: repo.id,
          projectId: repo.projectId,
          name: repo.name,
          ownerLogin: repo.ownerLogin,
          role: repo.role,
          specPath: repo.specPath,
        },
      },
    };
  }

  /** Le snapshot du commit, s'il existe (`ready`, `building` ou `failed`). */
  async snapshotOf(
    repoId: string,
    commitSha: string,
  ): Promise<{ id: string; status: "building" | "ready" | "failed" } | null> {
    return this.raw.specSnapshot.findUnique({
      where: { repoId_commitSha: { repoId, commitSha } },
      select: { id: true, status: true },
    });
  }

  /** Pointe la branche vers un snapshot déjà indexé (rafale, rejeu, force-push en arrière). */
  async moveHead(target: Target, branch: string, snapshotId: string): Promise<void> {
    const { organizationId } = target.installation;
    const repoId = target.repo.id;
    await withOrganization(organizationId, () =>
      this.client.specHead.upsert({
        where: { repoId_branch: { repoId, branch } },
        create: { organizationId, repoId, branch, snapshotId },
        update: { snapshotId },
      }),
    );
  }

  /** Retire le pointeur d'une branche supprimée ; les snapshots restent adressables par commit. */
  async deleteHead(target: Target, branch: string): Promise<void> {
    await withOrganization(target.installation.organizationId, () =>
      this.client.specHead.deleteMany({ where: { repoId: target.repo.id, branch } }),
    );
  }
}

import {
  type PrismaClient,
  type TenantClient,
  withOrganization,
  withTenantIsolation,
} from "@koklo/db";
import type {
  GitUserCredentials,
  IdeaTemplateKey,
  ProjectCreationStatus,
  Repo,
} from "@koklo/domain";
import { openUserCredentials, sealUserCredentials, type TokenCipher } from "@koklo/github";
import type { CreationFailure } from "./errors.ts";

export interface CreationInstallation {
  id: string;
  externalId: string;
  ownerKind: "user" | "organization";
  ownerLogin: string;
  status: "active" | "suspended" | "deleted";
}

/** Une création telle que le job la voit : la ligne, le projet, l'organisation et l'installation choisie. */
export interface LoadedCreation {
  id: string;
  organizationId: string;
  projectId: string;
  status: ProjectCreationStatus;
  repoName: string;
  ideaTemplate: IdeaTemplateKey;
  requestedBy: string;
  projectName: string;
  organizationSlug: string;
  installation: CreationInstallation | null;
}

/** Le repo porte la spec : rôle `spec`, ou dossier `spec_path` d'un monorepo (même règle que l'API). */
const CARRIER = { OR: [{ role: "spec" as const }, { specPath: { not: null } }] };

/**
 * Accès base du job `project-creation`. La création n'est connue que par son identifiant :
 * l'organisation se lit d'abord par le client brut, le reste passe par le client multi-tenant sous
 * `withOrganization`. Aucune méthode n'ouvre de transaction pendant un appel au fournisseur.
 */
export class ProjectCreationStore {
  private readonly client: TenantClient;

  private readonly raw: PrismaClient;

  private readonly cipher: TokenCipher | null;

  constructor(raw: PrismaClient, cipher: TokenCipher | null) {
    this.raw = raw;
    this.cipher = cipher;
    this.client = withTenantIsolation(raw);
  }

  async load(creationId: string): Promise<LoadedCreation | null> {
    const owner = await this.raw.projectCreation.findUnique({
      where: { id: creationId },
      select: { organizationId: true },
    });
    if (!owner) return null;
    const { organizationId } = owner;
    return withOrganization(organizationId, async () => {
      const row = await this.client.projectCreation.findFirst({
        where: { id: creationId },
        include: { project: { select: { name: true } } },
      });
      if (!row) return null;
      const [organization, installation] = await Promise.all([
        this.raw.organization.findUnique({ where: { id: organizationId }, select: { slug: true } }),
        row.installationId === null
          ? null
          : this.client.providerInstallation.findFirst({ where: { id: row.installationId } }),
      ]);
      return {
        id: row.id,
        organizationId,
        projectId: row.projectId,
        status: row.status as ProjectCreationStatus,
        repoName: row.repoName,
        ideaTemplate: row.ideaTemplate as IdeaTemplateKey,
        requestedBy: row.requestedBy,
        projectName: row.project.name,
        organizationSlug: organization?.slug ?? "organisation",
        installation: installation && {
          id: installation.id,
          externalId: installation.externalId,
          ownerKind: installation.ownerKind,
          ownerLogin: installation.ownerLogin,
          status: installation.status,
        },
      };
    });
  }

  /** `pending` ou `failed` vers `running` ; faux si une autre exécution a déjà pris la ligne. */
  async begin(creation: LoadedCreation): Promise<boolean> {
    const { count } = await withOrganization(creation.organizationId, () =>
      this.client.projectCreation.updateMany({
        where: { id: creation.id, status: { in: ["pending", "failed"] } },
        data: { status: "running", errorCode: null, retryAfterMs: null },
      }),
    );
    return count === 1;
  }

  /** Le projet a déjà son dépôt de spec (reprise après un succès dont l'écriture finale a été perdue). */
  hasSpecCarrier(creation: LoadedCreation): Promise<boolean> {
    return withOrganization(creation.organizationId, async () => {
      const carrier = await this.client.projectRepo.findFirst({
        where: { projectId: creation.projectId, ...CARRIER },
        select: { id: true },
      });
      return carrier !== null;
    });
  }

  /** Jeton utilisateur du demandeur pour cette installation ; `undefined` sans jeton ni clé de chiffrement. */
  async userCredentials(creation: LoadedCreation): Promise<GitUserCredentials | undefined> {
    const installation = creation.installation;
    if (!this.cipher || !installation) return undefined;
    const cipher = this.cipher;
    return withOrganization(creation.organizationId, async () => {
      const row = await this.client.providerUserCredential.findFirst({
        where: { userId: creation.requestedBy, installationId: installation.id },
      });
      return row
        ? openUserCredentials(cipher, creation.requestedBy, installation.id, row)
        : undefined;
    });
  }

  /** Jeton utilisateur rafraîchi par le fournisseur : réécrit chiffré, comme le fait l'API. */
  async saveUserCredentials(
    creation: LoadedCreation,
    credentials: GitUserCredentials,
  ): Promise<void> {
    const installation = creation.installation;
    if (!this.cipher || !installation) return;
    const data = sealUserCredentials(
      this.cipher,
      creation.requestedBy,
      installation.id,
      credentials,
    );
    await withOrganization(creation.organizationId, () =>
      this.client.providerUserCredential.upsert({
        where: {
          userId_installationId: { userId: creation.requestedBy, installationId: installation.id },
        },
        create: {
          organizationId: creation.organizationId,
          userId: creation.requestedBy,
          installationId: installation.id,
          ...data,
        },
        update: data,
      }),
    );
  }

  /** Dépôt créé : relié au projet, audité et `succeeded`, en une seule transaction. */
  async succeed(creation: LoadedCreation, installation: CreationInstallation, repo: Repo) {
    await withOrganization(creation.organizationId, () =>
      this.client.$transaction(async (tx) => {
        const row = await tx.projectRepo.create({
          data: {
            organizationId: creation.organizationId,
            projectId: creation.projectId,
            installationId: installation.id,
            role: "spec",
            mode: "new",
            externalId: repo.id,
            ownerLogin: repo.ref.owner.login,
            name: repo.ref.name,
            defaultBranch: repo.defaultBranch,
            specPath: null,
          },
        });
        await tx.auditLog.create({
          data: {
            organizationId: creation.organizationId,
            actorKind: "human",
            actorId: creation.requestedBy,
            action: "repo.createSpec",
            targetKind: "repo",
            targetId: row.id,
            projectId: creation.projectId,
          },
        });
        await tx.projectCreation.updateMany({
          where: { id: creation.id },
          data: { status: "succeeded", errorCode: null, retryAfterMs: null },
        });
      }),
    );
  }

  /** Dépôt déjà relié : la création est réglée sans toucher au fournisseur. */
  markSucceeded(creation: LoadedCreation): Promise<unknown> {
    return withOrganization(creation.organizationId, () =>
      this.client.projectCreation.updateMany({
        where: { id: creation.id },
        data: { status: "succeeded", errorCode: null, retryAfterMs: null },
      }),
    );
  }

  /** Aucun compte GitHub à utiliser : rien à créer, la création est « sautée » (pas un échec). */
  markSkipped(creation: LoadedCreation): Promise<unknown> {
    return withOrganization(creation.organizationId, () =>
      this.client.projectCreation.updateMany({
        where: { id: creation.id },
        data: { status: "skipped", errorCode: "no_account", retryAfterMs: null },
      }),
    );
  }

  /** Échec définitif : code fermé, jamais un message du fournisseur. */
  markFailed(creation: LoadedCreation, failure: CreationFailure): Promise<unknown> {
    return withOrganization(creation.organizationId, () =>
      this.client.projectCreation.updateMany({
        where: { id: creation.id },
        data: {
          status: "failed",
          errorCode: failure.code,
          retryAfterMs: failure.retryAfterMs ?? null,
        },
      }),
    );
  }

  /** Panne passagère : la ligne redevient `pending` avant la relance par pg-boss. */
  markPending(creation: LoadedCreation): Promise<unknown> {
    return withOrganization(creation.organizationId, () =>
      this.client.projectCreation.updateMany({
        where: { id: creation.id, status: "running" },
        data: { status: "pending" },
      }),
    );
  }
}

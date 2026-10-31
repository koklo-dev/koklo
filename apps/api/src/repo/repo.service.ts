import type { RepoOutput } from "@koklo/contract";
import type { GitProvider, RepoRole } from "@koklo/domain";
import { Inject, Injectable } from "@nestjs/common";
import { ORPCError } from "@orpc/server";
import { conflict, notFound } from "../tracker/api-errors.ts";
import type { ProjectScope } from "../tracker/scope.ts";
import { GitAccess, gitInstallationOf, step } from "./git-access.ts";
import {
  type InsertOutcome,
  REPO_REPOSITORY,
  type RepoRecord,
  type RepoRepository,
} from "./repo.repository.ts";
import { checkSpecPath, projectSlugOf, specRepoName } from "./repo-names.ts";
import { logOrphan, provisionSpecRepo } from "./spec-provisioning.ts";
import { buildInitialSpecFiles } from "./spec-scaffold.ts";
import { GIT_PROVIDER, type GitProviderBinding } from "./tokens.ts";

const outputOf = (repo: RepoRecord): RepoOutput => ({
  id: repo.id,
  projectId: repo.projectId,
  installationId: repo.installationId,
  role: repo.role,
  mode: repo.mode,
  ownerLogin: repo.ownerLogin,
  name: repo.name,
  defaultBranch: repo.defaultBranch,
  specPath: repo.specPath,
});

function recordOf(outcome: InsertOutcome): RepoRecord {
  if ("conflict" in outcome) throw conflict(outcome.conflict);
  return outcome.repo;
}

interface LinkInput {
  installationId: string;
  role: RepoRole;
  ownerLogin: string;
  name: string;
  specPath?: string | undefined;
}

/**
 * Dépôt de spec et dépôts du projet. Le réseau n'est jamais dans une transaction : lecture (A),
 * appels au fournisseur, puis insertion et audit (B). Une panne après `createRepo` laisse un dépôt
 * orphelin chez le fournisseur (le port ne sait pas en supprimer) : rien en base, reprise manuelle.
 */
@Injectable()
export class RepoService {
  constructor(
    @Inject(REPO_REPOSITORY) private readonly repository: RepoRepository,
    @Inject(GIT_PROVIDER) private readonly provider: GitProviderBinding,
    @Inject(GitAccess) private readonly access: GitAccess,
  ) {}

  async list(scope: ProjectScope): Promise<RepoOutput[]> {
    return (await this.repository.list(scope)).map(outputOf);
  }

  async createSpec(
    scope: ProjectScope,
    input: { installationId: string; name?: string | undefined },
  ): Promise<RepoOutput> {
    const plan = await this.repository.plan(scope, input.installationId);
    const name = specRepoName(plan.projectName, input.name);
    if (plan.hasSpecCarrier) throw conflict("spec_repo_exists");
    const provider = this.requireProvider();
    const { installation } = plan;
    const ref = { owner: gitInstallationOf(installation).owner, name };

    const files = buildInitialSpecFiles({
      projectName: plan.projectName,
      organizationSlug: plan.organizationSlug,
      projectSlug: projectSlugOf(plan.projectName),
    });
    const auth = await this.access.creationAuth(provider, scope, installation);
    const created = await provisionSpecRepo(provider, auth, { ref, files });

    try {
      const outcome = await this.repository.insert(
        scope,
        {
          installationId: installation.id,
          role: "spec",
          mode: "new",
          externalId: created.id,
          ownerLogin: created.ref.owner.login,
          name: created.ref.name,
          defaultBranch: created.defaultBranch,
          specPath: null,
        },
        "repo.createSpec",
      );
      return outputOf(recordOf(outcome));
    } catch (error) {
      logOrphan(ref, "insert");
      throw error;
    }
  }

  async link(scope: ProjectScope, input: LinkInput): Promise<RepoOutput> {
    const plan = await this.repository.plan(scope, input.installationId);
    const specPath = checkSpecPath(input.role, input.specPath);
    if ((input.role === "spec" || specPath !== null) && plan.hasSpecCarrier) {
      throw conflict("spec_repo_exists");
    }
    const { installation } = plan;
    if (input.ownerLogin.toLowerCase() !== installation.ownerLogin.toLowerCase()) throw notFound();
    const provider = this.requireProvider();
    const owner = gitInstallationOf(installation).owner;

    const auth = await this.access.installationAuth(provider, installation);
    const found = await step("getRepo", () =>
      provider.getRepo({ auth, repo: { owner, name: input.name } }),
    );
    const outcome = await this.repository.insert(
      scope,
      {
        installationId: installation.id,
        role: input.role,
        mode: "adopted",
        externalId: found.id,
        ownerLogin: found.ref.owner.login,
        name: found.ref.name,
        defaultBranch: found.defaultBranch,
        specPath,
      },
      "repo.link",
    );
    return outputOf(recordOf(outcome));
  }

  /** Sans App GitHub configurée : `PROVIDER_UNAVAILABLE`, avant tout appel et toute écriture. */
  private requireProvider(): GitProvider {
    if (this.provider === null) throw new ORPCError("PROVIDER_UNAVAILABLE");
    return this.provider;
  }
}

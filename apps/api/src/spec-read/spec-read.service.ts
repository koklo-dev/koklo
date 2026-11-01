import type { FeatureDetail, FeatureSummary, SpecHeadOutput } from "@koklo/contract";
import { parseFeatureMarkdown } from "@koklo/schema";
import { Inject, Injectable } from "@nestjs/common";
import { ORPCError } from "@orpc/server";
import { GitAccess, step } from "../repo/git-access.ts";
import { GIT_PROVIDER, type GitProviderBinding } from "../repo/tokens.ts";
import { orNotFound } from "../tracker/api-errors.ts";
import { DEFAULT_PAGE_SIZE } from "../tracker/cursor.ts";
import type { ProjectScope } from "../tracker/scope.ts";
import { detailOf } from "./feature-detail.ts";
import { compareFeatures, pageFeatures } from "./feature-page.ts";
import {
  type FeatureFilter,
  type Revision,
  SPEC_READ_REPOSITORY,
  type SpecReadRepository,
} from "./spec-read.repository.ts";

const indexFailed = (failure: { errorCode: string; commitSha: string }) =>
  new ORPCError("SPEC_INDEX_FAILED", {
    data: { errorCode: failure.errorCode, commitSha: failure.commitSha },
  });

/**
 * Lectures de la spec (TK-45c2). `head` et `listFeatures` ne lisent que l'index ; `getFeature`
 * décide sur l'index puis lit le fichier chez le fournisseur au commit indexé, hors transaction.
 * Aucune écriture, aucune entrée d'audit.
 */
@Injectable()
export class SpecReadService {
  constructor(
    @Inject(SPEC_READ_REPOSITORY) private readonly repository: SpecReadRepository,
    @Inject(GIT_PROVIDER) private readonly provider: GitProviderBinding,
    @Inject(GitAccess) private readonly access: GitAccess,
  ) {}

  head(scope: ProjectScope, revision: Revision): Promise<SpecHeadOutput> {
    return this.repository.head(scope, revision);
  }

  async listFeatures(
    scope: ProjectScope,
    input: Revision & FeatureFilter & { limit?: number; cursor?: string },
  ): Promise<{ items: FeatureSummary[]; nextCursor: string | null }> {
    const { branch, commitSha, status, priority, limit, cursor } = input;
    const indexed = await this.repository.features(
      scope,
      { branch, commitSha },
      { status, priority },
    );
    if (indexed?.kind === "failed") throw indexFailed(indexed);
    return pageFeatures(indexed?.rows ?? [], limit ?? DEFAULT_PAGE_SIZE, cursor);
  }

  /**
   * Features de la tête indexée, en ordre numérique, pour nourrir un prompt ou chercher un doublon.
   * Vide quand rien n'est indexé ou que l'index est en échec ; `NOT_FOUND` si le projet n'est pas
   * de l'organisation.
   */
  async indexedFeatures(scope: ProjectScope): Promise<FeatureSummary[]> {
    const indexed = await this.repository.features(scope, {}, {});
    return indexed?.kind === "rows" ? [...indexed.rows].sort(compareFeatures) : [];
  }

  async getFeature(scope: ProjectScope, specId: string): Promise<FeatureDetail> {
    const source = orNotFound(await this.repository.featureSource(scope, specId));
    if (source.kind === "failed") throw indexFailed(source);
    if (this.provider === null || !source.installation.active) {
      throw new ORPCError("PROVIDER_UNAVAILABLE");
    }
    const provider = this.provider;
    const auth = await this.access.installationAuth(provider, {
      id: source.installation.id,
      externalId: source.installation.externalId,
      ownerKind: source.owner.kind,
      ownerLogin: source.owner.login,
    });
    const path =
      source.specPath === null ? source.filePath : `${source.specPath}/${source.filePath}`;
    const file = await step("readFile", () =>
      provider.readFile({
        auth,
        repo: { owner: source.owner, name: source.repoName },
        ref: source.commitSha,
        path,
      }),
    );
    const parsed = parseFeatureMarkdown(source.filePath, file.content);
    if (!parsed.ok) throw new Error("indexed feature file is not parseable");
    return detailOf(parsed.value, source.filePath, source.commitSha);
  }
}

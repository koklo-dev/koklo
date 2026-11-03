import type {
  clientSpaceFeatureOutputSchema,
  clientSpaceFeaturesOutputSchema,
  clientSpaceProjectsOutputSchema,
} from "@koklo/contract";
import { Inject, Injectable } from "@nestjs/common";
import { ORPCError } from "@orpc/server";
import type { z } from "zod";
import { pageFeatures } from "../spec-read/feature-page.ts";
import { SpecReadService } from "../spec-read/spec-read.service.ts";
import { notFound } from "../tracker/api-errors.ts";
import { DEFAULT_PAGE_SIZE } from "../tracker/cursor.ts";
import type { ProjectScope } from "../tracker/scope.ts";
import {
  CLIENT_SPACE_REPOSITORY,
  type ClientSpaceRepository,
  type FeatureTrail,
} from "./client-space.repository.ts";
import { validationOf } from "./validation.ts";

type Projects = z.output<typeof clientSpaceProjectsOutputSchema>;
type Features = z.output<typeof clientSpaceFeaturesOutputSchema>;
type Feature = z.output<typeof clientSpaceFeatureOutputSchema>;

/** Seule erreur de lecture exposée : elle masque index absent ou en échec et pannes du fournisseur. */
const notReady = () => new ORPCError("SPACE_NOT_READY");

/** Après le contrôle de l'index, tout échec de lecture (fichier, fournisseur) est masqué. */
const isHiddenFailure = (error: unknown): boolean =>
  error instanceof ORPCError &&
  (error.code === "NOT_FOUND" ||
    error.code === "SPEC_INDEX_FAILED" ||
    error.code.startsWith("PROVIDER_"));

const stateOf = (trail: FeatureTrail | undefined, sha: string) => ({
  ...validationOf(trail?.latestReview, sha),
  openSuggestions: trail?.openSuggestions ?? 0,
});

/**
 * Lectures de l'espace client (TK-55b) : vocabulaire métier uniquement. Aucune écriture ; le statut
 * de validation se calcule sur le journal des reviews (vide tant que la validation n'écrit rien).
 */
@Injectable()
export class ClientSpaceService {
  constructor(
    @Inject(CLIENT_SPACE_REPOSITORY) private readonly repository: ClientSpaceRepository,
    @Inject(SpecReadService) private readonly specs: SpecReadService,
  ) {}

  projects(organizationId: string, linkedIds: readonly string[] | null): Promise<Projects> {
    return this.repository.projects(organizationId, linkedIds);
  }

  async features(
    scope: ProjectScope,
    input: { limit?: number; cursor?: string },
  ): Promise<Features> {
    const head = await this.repository.indexedHead(scope);
    if (head === null) throw notReady();
    const page = pageFeatures(head.rows, input.limit ?? DEFAULT_PAGE_SIZE, input.cursor);
    const trails = await this.repository.trails(
      scope,
      page.items.map((row) => row.specId),
    );
    return {
      items: page.items.map((row) => ({
        id: row.specId,
        title: row.title,
        priority: row.priority,
        criteriaCount: row.criteriaCount,
        ...stateOf(trails.get(row.specId), head.sha),
      })),
      version: head.sha,
      nextCursor: page.nextCursor,
    };
  }

  async feature(scope: ProjectScope, featureId: string): Promise<Feature> {
    const head = await this.repository.featureHead(scope, featureId);
    if (head === null) throw notReady();
    if (!head.found) throw notFound();
    const detail = await this.specs.getFeature(scope, featureId).catch((error: unknown) => {
      throw isHiddenFailure(error) ? notReady() : error;
    });
    const trail = (await this.repository.trails(scope, [featureId])).get(featureId);
    const { openSuggestions: _open, ...state } = stateOf(trail, detail.commitSha);
    return {
      id: detail.specId,
      title: detail.title,
      description: detail.description,
      priority: detail.priority,
      criteria: detail.criteria.map(({ specId, title, steps }) => ({ id: specId, title, steps })),
      ...state,
      version: detail.commitSha,
    };
  }
}

import type {
  IdeaListOutput,
  IdeaPage,
  IdeaPageDetail,
  IdeaPageSummary,
  IdeaPresenceOutput,
} from "@koklo/contract";
import { normalizeIdeaContent, normalizeIdeaTitle, SCOPING_BRANCH } from "@koklo/domain";
import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../clock.ts";
import { GIT_PROVIDER, type GitProviderBinding } from "../repo/tokens.ts";
import { SpecBatchService } from "../spec-batch/spec-batch.service.ts";
import { viaDomain } from "../tracker/api-errors.ts";
import type { ProjectScope } from "../tracker/scope.ts";
import { IDEA_REPOSITORY, type IdeaRepository } from "./idea.repository.ts";
import { buildIdeaBatch } from "./idea-batch.ts";
import { pageOf, proposalOf, summaryOf } from "./idea-views.ts";

/** Deux initiales au plus, en majuscules, depuis les premiers mots du nom. */
export function initialsOf(name: string): string {
  const letters = name
    .split(/\s+/)
    .filter((word) => word !== "")
    .slice(0, 2)
    .map((word) => [...word][0] ?? "");
  return letters.join("").toLocaleUpperCase("fr") || "?";
}

/**
 * Espace Idée (TK-89) : le client rédige sans publier, le business lit. Les bornes (titre, contenu) sont
 * contrôlées ici par le domaine ; l'accès au projet l'est par le contrôleur ; les écritures sont atomiques
 * dans le dépôt. La publication crée un lot de spec (exécuté par le worker) sans écrire chez le fournisseur.
 */
@Injectable()
export class IdeaService {
  constructor(
    @Inject(IDEA_REPOSITORY) private readonly repository: IdeaRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(SpecBatchService) private readonly batches: SpecBatchService,
    @Inject(GIT_PROVIDER) private readonly provider: GitProviderBinding,
  ) {}

  private now(): Date {
    return new Date(this.clock.now());
  }

  private actor(role: string | undefined) {
    return { role: role ?? "", now: this.now() };
  }

  async list(scope: ProjectScope): Promise<IdeaListOutput> {
    const listing = await this.repository.list(scope, this.now());
    return {
      pages: listing.pages.map((record) => ({
        ...summaryOf(record),
        pendingProposals: record.pendingProposals ?? 0,
      })),
      trash: listing.trash.map(summaryOf),
      total: listing.pages.length,
      publication: {
        available: listing.hasSpecRepo && this.provider !== null,
        last: listing.lastPublication && {
          commitSha: listing.lastPublication.commitSha,
          publishedAt: listing.lastPublication.publishedAt.toISOString(),
        },
      },
      pendingPageProposals: listing.pendingPageProposals.map(proposalOf),
    };
  }

  async get(scope: ProjectScope, pageId: string): Promise<IdeaPageDetail> {
    const record = await this.repository.get(scope, pageId, this.now());
    return { ...pageOf(record), proposals: (record.proposals ?? []).map(proposalOf) };
  }

  async save(
    scope: ProjectScope,
    role: string | undefined,
    input: { pageId: string; baseVersion: number; contentMd: string },
  ): Promise<IdeaPage> {
    const contentMd = viaDomain(() => normalizeIdeaContent(input.contentMd));
    return pageOf(
      await this.repository.save(
        scope,
        this.actor(role),
        input.pageId,
        input.baseVersion,
        contentMd,
      ),
    );
  }

  async setStatus(
    scope: ProjectScope,
    role: string | undefined,
    input: { pageId: string; status: "draft" | "review" | "stable" },
  ): Promise<IdeaPage> {
    return pageOf(
      await this.repository.setStatus(scope, this.actor(role), input.pageId, input.status),
    );
  }

  async createPage(
    scope: ProjectScope,
    role: string | undefined,
    input: { title: string; afterPageId?: string | undefined },
  ): Promise<IdeaPage> {
    const title = viaDomain(() => normalizeIdeaTitle(input.title));
    return pageOf(
      await this.repository.createPage(scope, this.actor(role), {
        title,
        afterPageId: input.afterPageId,
      }),
    );
  }

  async rename(
    scope: ProjectScope,
    role: string | undefined,
    input: { pageId: string; title: string },
  ): Promise<IdeaPage> {
    const title = viaDomain(() => normalizeIdeaTitle(input.title));
    return pageOf(await this.repository.rename(scope, this.actor(role), input.pageId, title));
  }

  async reorder(
    scope: ProjectScope,
    role: string | undefined,
    pageIds: string[],
  ): Promise<{ pages: IdeaPageSummary[] }> {
    const pages = await this.repository.reorder(scope, this.actor(role), pageIds);
    return { pages: pages.map(summaryOf) };
  }

  async remove(scope: ProjectScope, role: string | undefined, pageId: string) {
    return summaryOf(await this.repository.remove(scope, this.actor(role), pageId));
  }

  async restore(scope: ProjectScope, role: string | undefined, pageId: string): Promise<IdeaPage> {
    return pageOf(await this.repository.restore(scope, this.actor(role), pageId));
  }

  async presence(
    scope: ProjectScope,
    pageId: string | null | undefined,
  ): Promise<IdeaPresenceOutput> {
    const present = await this.repository.touchPresence(scope, pageId ?? null, this.now());
    return {
      present: present.map((entry) => ({
        initials: initialsOf(entry.name),
        name: entry.name,
        isClient: entry.isClient,
        pageId: entry.pageId,
        mine: entry.userId === scope.userId,
      })),
    };
  }

  /** Crée le lot de publication (instantané du dossier) sur `cadrage` ; le worker l'exécute. */
  async publish(
    scope: ProjectScope,
    role: string | undefined,
    idempotencyKey: string,
  ): Promise<{ batchId: string }> {
    const snapshot = await this.repository.snapshot(scope);
    const batchId = await this.batches.enqueuePrepared(scope, role ?? "", () =>
      buildIdeaBatch(snapshot, idempotencyKey, SCOPING_BRANCH),
    );
    return { batchId };
  }
}

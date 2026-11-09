import type { IdeaFreezeOutput } from "@koklo/contract";
import { framingReadiness, SCOPING_BRANCH } from "@koklo/domain";
import { Inject, Injectable } from "@nestjs/common";
import { ORPCError } from "@orpc/server";
import { CLOCK, type Clock } from "../clock.ts";
import { SpecBatchService } from "../spec-batch/spec-batch.service.ts";
import type { ProjectScope } from "../tracker/scope.ts";
import { IDEA_REPOSITORY, type IdeaRepository, type IdeaSnapshot } from "./idea.repository.ts";
import { buildIdeaBatch } from "./idea-batch.ts";
import {
  type AllocatedVersion,
  type FrozenLot,
  IDEA_FREEZE_REPOSITORY,
  type IdeaFreezeRepository,
} from "./idea-freeze.repository.ts";
import { IdeaSynthesisService, promptPagesOf } from "./idea-synthesis.service.ts";

/** Synthèse générée pour une version : portée par ce lot, donc publiée avec lui. */
interface GeneratedSynthesis {
  contentMd: string;
  source: string;
  generatedAt: Date;
}

const thresholdRefused = () =>
  new ORPCError("FORBIDDEN", { data: { reason: "framing_threshold" } });

/** Version de contenu figée par slug : l'empreinte de « modifié depuis » (B259). */
const versionsOf = (snapshot: IdeaSnapshot): Record<string, number> =>
  Object.fromEntries(snapshot.pages.map((page) => [page.slug, page.version]));

const outputOf = (lot: FrozenLot, synthesisError?: string): IdeaFreezeOutput => ({
  batchId: lot.batchId,
  tag: lot.tag,
  synthesis: lot.hasSynthesis ? "generated" : "skipped",
  ...(synthesisError === undefined ? {} : { synthesisError }),
});

/**
 * Passage au cadrage (TK-91, B255 à B258) : refuse le seuil côté serveur, alloue `idea-vN`, génère la Synthèse
 * (jamais bloquant), puis enregistre UN lot (pages, index, Synthèse, tag) que le worker commite puis tague.
 * Le numéro est rendu si le lot ne peut pas être enregistré.
 */
@Injectable()
export class IdeaFreezeService {
  constructor(
    @Inject(IDEA_REPOSITORY) private readonly ideas: IdeaRepository,
    @Inject(IDEA_FREEZE_REPOSITORY) private readonly versions: IdeaFreezeRepository,
    @Inject(IdeaSynthesisService) private readonly synthesis: IdeaSynthesisService,
    @Inject(SpecBatchService) private readonly batches: SpecBatchService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async freeze(
    scope: ProjectScope,
    role: string | undefined,
    idempotencyKey: string,
    requestId: string,
  ): Promise<IdeaFreezeOutput> {
    const replay = await this.versions.byKey(scope, idempotencyKey);
    if (replay !== null) return outputOf(replay);
    const snapshot = await this.ideas.snapshot(scope);
    if (!framingReadiness(snapshot.pages).ready) throw thresholdRefused();
    // Dépôt de spec et fournisseur d'abord : aucun appel du modèle pour un lot qui ne pourra pas être enregistré.
    await this.batches.ensureWritable(scope);
    const version = await this.versions.allocate(scope, {
      pagesVersions: versionsOf(snapshot),
      now: new Date(this.clock.now()),
    });
    const generated = await this.generated(scope, requestId, snapshot, version);
    const batchId = await this.register(scope, role ?? "", idempotencyKey, snapshot, {
      version,
      synthesis: generated.record,
    });
    await this.versions.attach(scope, {
      versionId: version.id,
      batchId,
      synthesis: generated.record,
    });
    return outputOf(
      { batchId, tag: version.tag, hasSynthesis: generated.record !== null },
      generated.error,
    );
  }

  /** La Synthèse ne bloque jamais le passage : tout échec devient `skipped` + le code de l'erreur (B256). */
  private async generated(
    scope: ProjectScope,
    requestId: string,
    snapshot: IdeaSnapshot,
    version: AllocatedVersion,
  ): Promise<{ record: GeneratedSynthesis | null; error: string | undefined }> {
    try {
      const contentMd = await this.synthesis.generate(
        scope,
        requestId,
        promptPagesOf(snapshot.pages),
      );
      const record = { contentMd, source: version.tag, generatedAt: new Date(this.clock.now()) };
      return { record, error: undefined };
    } catch (error) {
      return { record: null, error: error instanceof ORPCError ? error.code : "INTERNAL" };
    }
  }

  private async register(
    scope: ProjectScope,
    role: string,
    idempotencyKey: string,
    snapshot: IdeaSnapshot,
    lot: { version: AllocatedVersion; synthesis: GeneratedSynthesis | null },
  ): Promise<string> {
    try {
      return await this.batches.enqueuePrepared(scope, role, () =>
        buildIdeaBatch(snapshot, idempotencyKey, SCOPING_BRANCH, {
          synthesis: lot.synthesis,
          tag: lot.version.tag,
        }),
      );
    } catch (error) {
      await this.versions.release(scope, lot.version.id);
      throw error;
    }
  }
}

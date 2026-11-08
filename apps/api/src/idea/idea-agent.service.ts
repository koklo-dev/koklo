import type {
  AiIdeaChatEvent,
  AiIdeaChatInput,
  AiIdeaGapsOutput,
  IdeaMessage,
} from "@koklo/contract";
import { Inject, Injectable } from "@nestjs/common";
import type { AiPurpose } from "../ai/ai-budget.ts";
import { AiCallRunner, type AiStreamEnd, correlationIdOf, validated } from "../ai/ai-call.ts";
import { rateLimited } from "../ai/ai-errors.ts";
import { ideaChatPrompt, ideaGapsPrompt, ideaProposePrompt } from "../ai/ai-idea-prompts.ts";
import { ideaGapsOutputSchema, ideaProposalsOutputSchema, jsonSchemaOf } from "../ai/ai-schemas.ts";
import { PrismaAiRoutingStore } from "../ai/prisma-ai-routing-store.ts";
import { CLOCK, type Clock } from "../clock.ts";
import { DEFAULT_PAGE_SIZE } from "../tracker/cursor.ts";
import type { ProjectScope } from "../tracker/scope.ts";
import {
  IDEA_AGENT_REPOSITORY,
  type IdeaAgentContext,
  type IdeaAgentRepository,
  type IdeaGapItem,
  type IdeaProposalDraft,
} from "./idea-agent.repository.ts";
import { checkedDrafts, promptContextOf, relayText, wantsProposals } from "./idea-chat-flow.ts";
import { nextQuestion } from "./idea-guide.ts";
import { proposalOf } from "./idea-views.ts";

/** Un appel d'IA à la fois par utilisateur et projet : le verrou vit 120 s et un refus invite à réessayer dans 5 s. */
const LOCK_TTL_MS = 120_000;
const LOCK_RETRY_SECONDS = 5;
/** Un calcul des manques de moins de 30 s est rendu tel quel, sans appel du modèle (C6). */
const GAPS_TTL_MS = 30_000;

const PROPOSALS_SCHEMA = jsonSchemaOf(ideaProposalsOutputSchema);
const GAPS_SCHEMA = jsonSchemaOf(ideaGapsOutputSchema);

type Role = string | undefined;
type ChatStream = AsyncGenerator<string, AiStreamEnd | undefined>;

/**
 * Agent de l'espace Idée (TK-90). Il écrit un message et des PROPOSITIONS, jamais une page : seule la décision d'un
 * humain (`idea.proposal.decide`) change le dossier. Un seul appel d'IA à la fois par utilisateur et projet, par un
 * verrou en base ; le message est streamé puis, selon l'action, une seconde requête JSON propose du contenu (même
 * verrou, même quota). Rien n'est stocké si l'un des deux échoue.
 */
@Injectable()
export class IdeaAgentService {
  constructor(
    @Inject(IDEA_AGENT_REPOSITORY) private readonly repository: IdeaAgentRepository,
    @Inject(AiCallRunner) private readonly runner: AiCallRunner,
    @Inject(PrismaAiRoutingStore) private readonly routing: PrismaAiRoutingStore,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Le client ne lit pas `aiProvider.list` (réservé aux gestionnaires) : il lit seulement cet état. */
  async status(scope: ProjectScope, role: Role) {
    const routing = await this.routing.load(scope.organizationId);
    return {
      configured: routing.availableProviders.length > 0,
      canConfigure: role === "owner" || role === "admin",
    };
  }

  async messages(
    scope: ProjectScope,
    query: { cursor?: string | undefined; limit?: number | undefined },
  ) {
    const page = await this.repository.messages(scope, {
      cursor: query.cursor,
      limit: query.limit ?? DEFAULT_PAGE_SIZE,
    });
    const items: IdeaMessage[] = page.items.map((message) => ({
      ...message,
      createdAt: message.createdAt.toISOString(),
    }));
    return {
      items,
      nextCursor: page.nextCursor,
      previousCursor: null,
      offset: page.offset,
      total: page.total,
    };
  }

  /**
   * Prépare le flux : tout refus d'avant le premier octet (page, prompt, clé, plafond, quota, verrou) est une vraie
   * erreur HTTP. Le verrou est rendu à la fin du flux, sur échec, sur annulation du client comme sur fermeture.
   */
  async chat(
    scope: ProjectScope,
    _role: Role,
    input: AiIdeaChatInput,
    requestId: string,
    signal?: AbortSignal,
  ): Promise<AsyncGenerator<AiIdeaChatEvent>> {
    const context = await this.repository.context(scope, input.pageId);
    const token = await this.lock(scope);
    try {
      const stream = await this.runner.stream({
        ...this.base(scope, requestId, "idea-chat", "ai.idea.chat"),
        usage: "idea_space",
        exclusive: true,
        ...(signal === undefined ? {} : { signal }),
        frame: (nonce) => ideaChatPrompt(nonce, promptContextOf(context), this.chatInput(input)),
      });
      return this.events(scope, input, context, stream, requestId, token, signal);
    } catch (error) {
      await this.repository.unlock(scope, token);
      throw error;
    }
  }

  private async *events(
    scope: ProjectScope,
    input: AiIdeaChatInput,
    context: IdeaAgentContext,
    stream: ChatStream,
    requestId: string,
    token: Date,
    signal: AbortSignal | undefined,
  ): AsyncGenerator<AiIdeaChatEvent> {
    try {
      const reply = yield* relayText(stream);
      const drafts = wantsProposals(input, context)
        ? await this.propose(scope, input, context, reply, requestId, signal)
        : [];
      const saved = await this.repository.recordExchange(scope, {
        pageId: context.focus?.id ?? null,
        baseVersion: context.focus?.version ?? null,
        mode: input.mode,
        humanText: input.text,
        agentText: reply,
        proposals: drafts,
      });
      if (saved.proposals.length > 0) {
        yield { type: "proposals", proposals: saved.proposals.map(proposalOf) };
      }
      const next =
        input.mode === "interview"
          ? nextQuestion(context.focus?.templateKey, context.answers + 1)
          : undefined;
      yield {
        type: "done",
        messageId: saved.messageId,
        ...(next === undefined ? {} : { nextQuestion: next }),
      };
    } finally {
      await stream.return(undefined);
      await this.repository.unlock(scope, token);
    }
  }

  /** Second appel (JSON) : même verrou et même admission que le message ; sortie filtrée puis recoupée avec la page. */
  private propose(
    scope: ProjectScope,
    input: AiIdeaChatInput,
    context: IdeaAgentContext,
    reply: string,
    requestId: string,
    signal: AbortSignal | undefined,
  ): Promise<IdeaProposalDraft[]> {
    return this.runner.run({
      ...this.base(scope, requestId, "idea-propose", "ai.idea.chat"),
      usage: "idea_space",
      exclusive: true,
      admitted: true,
      ...(signal === undefined ? {} : { signal }),
      output: { kind: "json", schema: PROPOSALS_SCHEMA },
      frame: (nonce) =>
        ideaProposePrompt(nonce, promptContextOf(context), this.chatInput(input), reply),
      settle: (response) =>
        checkedDrafts(
          validated(response, (raw) => ideaProposalsOutputSchema.parse(raw)).proposals,
          context,
        ),
    });
  }

  /** « Ce qui manque encore » : 4 manques au plus, mémorisés 30 s par projet. */
  async gaps(scope: ProjectScope, requestId: string): Promise<AiIdeaGapsOutput> {
    const now = new Date(this.clock.now());
    const cached = await this.repository.gapRun(scope);
    if (cached !== null && now.getTime() - cached.computedAt.getTime() < GAPS_TTL_MS) {
      return { items: cached.items, computedAt: cached.computedAt.toISOString(), cached: true };
    }
    const context = await this.repository.context(scope, undefined);
    const token = await this.lock(scope);
    try {
      const items = await this.runner.run({
        ...this.base(scope, requestId, "idea-gaps", "ai.idea.gaps"),
        usage: "idea_space",
        exclusive: true,
        output: { kind: "json", schema: GAPS_SCHEMA },
        frame: (nonce) => ideaGapsPrompt(nonce, promptContextOf(context)),
        settle: (response) =>
          this.gapsOf(
            validated(response, (raw) => ideaGapsOutputSchema.parse(raw)),
            context,
          ),
      });
      await this.repository.saveGapRun(scope, { computedAt: now, items });
      return { items, computedAt: now.toISOString(), cached: false };
    } finally {
      await this.repository.unlock(scope, token);
    }
  }

  /** Une page nommée comme une page du dossier la désigne ; sinon c'est une page à créer. */
  private gapsOf(
    output: { items: { page: string; text: string }[] },
    context: IdeaAgentContext,
  ): IdeaGapItem[] {
    const byTitle = new Map(
      context.pages.map((page) => [page.title.trim().toLowerCase(), page.id]),
    );
    return output.items.slice(0, 4).map((item) => {
      const pageId = byTitle.get(item.page.trim().toLowerCase()) ?? null;
      return {
        pageId,
        suggestedPageTitle: pageId === null ? item.page : null,
        text: item.text,
      };
    });
  }

  private async lock(scope: ProjectScope): Promise<Date> {
    const token = await this.repository.tryLock(scope, new Date(this.clock.now()), LOCK_TTL_MS);
    if (token === null) throw rateLimited(LOCK_RETRY_SECONDS);
    return token;
  }

  private chatInput(input: AiIdeaChatInput) {
    return {
      mode: input.mode,
      action: input.action,
      text: input.text,
      selection: input.selection,
    };
  }

  private base(scope: ProjectScope, requestId: string, purpose: AiPurpose, action: string) {
    return {
      purpose,
      actor: {
        organizationId: scope.organizationId,
        userId: scope.userId,
        projectId: scope.projectId,
      },
      correlationId: correlationIdOf(requestId),
      quota: "ai" as const,
      entry: () => ({ action, targetKind: "project" as const, targetId: scope.projectId }),
    };
  }
}

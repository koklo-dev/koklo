import type { IdeaSynthesis } from "@koklo/contract";
import { Inject, Injectable } from "@nestjs/common";
import { AiCallRunner, validated } from "../ai/ai-call.ts";
import { type IdeaPromptPage, ideaSynthesisPrompt } from "../ai/ai-idea-prompts.ts";
import { ideaSynthesisOutputSchema, jsonSchemaOf } from "../ai/ai-schemas.ts";
import { CLOCK, type Clock } from "../clock.ts";
import type { ProjectScope } from "../tracker/scope.ts";
import {
  IDEA_REPOSITORY,
  type IdeaRepository,
  type IdeaSynthesisRecord,
} from "./idea.repository.ts";
import { IDEA_AGENT_REPOSITORY, type IdeaAgentRepository } from "./idea-agent.repository.ts";
import { acquireIdeaLock, ideaCallBase } from "./idea-ai-call.ts";
import {
  IDEA_SYNTHESIS_REPOSITORY,
  type IdeaSynthesisRepository,
} from "./idea-synthesis.repository.ts";

const SYNTHESIS_SCHEMA = jsonSchemaOf(ideaSynthesisOutputSchema);

export const synthesisViewOf = (record: IdeaSynthesisRecord): IdeaSynthesis => ({
  contentMd: record.contentMd,
  source: record.source,
  generatedAt: record.generatedAt.toISOString(),
});

/** Ce que le modèle lit du dossier : titres et contenus, jamais un identifiant, un auteur ni un fil. */
export const promptPagesOf = (
  pages: readonly { title: string; contentMd: string }[],
): IdeaPromptPage[] =>
  pages.map((page) => ({ title: page.title, templateKey: null, contentMd: page.contentMd }));

/**
 * Synthèse de l'idée (TK-91). Elle est lue par tous les rôles de lecture, générée par l'équipe (même plafond
 * d'organisation, même quota et même verrou exclusif par projet que « Ce qui manque encore »). Sa sortie est une
 * donnée hostile : texte sans lien, balise ni image (D6), rendu inerte côté écran.
 */
@Injectable()
export class IdeaSynthesisService {
  constructor(
    @Inject(IDEA_REPOSITORY) private readonly ideas: IdeaRepository,
    @Inject(IDEA_AGENT_REPOSITORY) private readonly locks: IdeaAgentRepository,
    @Inject(IDEA_SYNTHESIS_REPOSITORY) private readonly store: IdeaSynthesisRepository,
    @Inject(AiCallRunner) private readonly runner: AiCallRunner,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async get(scope: ProjectScope): Promise<IdeaSynthesis | null> {
    const record = await this.store.get(scope);
    return record === null ? null : synthesisViewOf(record);
  }

  /**
   * « Régénérer » : `source` est la dernière version commitée (publiée avec la publication suivante), vide avant la
   * première version (un aperçu, jamais publié).
   */
  async regenerate(scope: ProjectScope, requestId: string): Promise<IdeaSynthesis> {
    const snapshot = await this.ideas.snapshot(scope);
    const contentMd = await this.generate(scope, requestId, promptPagesOf(snapshot.pages));
    const record = {
      contentMd,
      source: await this.store.latestTag(scope),
      generatedAt: new Date(this.clock.now()),
    };
    await this.store.save(scope, record);
    return synthesisViewOf(record);
  }

  /** L'appel du modèle seul (verrou exclusif, quota, audit `ai.idea.synthesis`) ; rien n'est stocké ici. */
  async generate(
    scope: ProjectScope,
    requestId: string,
    pages: readonly IdeaPromptPage[],
  ): Promise<string> {
    const token = await acquireIdeaLock(this.locks, this.clock, scope);
    try {
      return await this.runner.run({
        ...ideaCallBase(scope, requestId, "idea-synthesis", "ai.idea.synthesis"),
        usage: "idea_space",
        exclusive: true,
        output: { kind: "json", schema: SYNTHESIS_SCHEMA },
        frame: (nonce) => ideaSynthesisPrompt(nonce, pages),
        settle: (response) =>
          validated(response, (raw) => ideaSynthesisOutputSchema.parse(raw)).contentMd,
      });
    } finally {
      await this.locks.unlock(scope, token);
    }
  }
}

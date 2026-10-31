import type { InstallationOutput } from "@koklo/contract";
import { GitProviderError } from "@koklo/domain";
import { Inject, Injectable } from "@nestjs/common";
import { ORPCError } from "@orpc/server";
import { CLOCK, type Clock } from "../clock.ts";
import { notFound, validation } from "../tracker/api-errors.ts";
import type { AuditActor } from "../tracker/audit.ts";
import { INSTALLATION_REPOSITORY, type InstallationRepository } from "./installation.repository.ts";
import { INSTALLATION_FLOW, type InstallationFlow } from "./installation-flow.ts";

/** Durée de vie d'un état (la base la borne aussi à 10 minutes). */
export const STATE_TTL_MS = 10 * 60 * 1000;
const GITHUB = "https://github.com";

const unavailable = () => new ORPCError("PROVIDER_UNAVAILABLE");

@Injectable()
export class InstallationService {
  constructor(
    @Inject(INSTALLATION_REPOSITORY) private readonly repository: InstallationRepository,
    @Inject(INSTALLATION_FLOW) private readonly flow: InstallationFlow | null,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  list(actor: AuditActor): Promise<InstallationOutput[]> {
    return this.repository.list(actor, this.clock.now());
  }

  /**
   * URL à ouvrir chez GitHub avec un état signé. Sans `installationId` : installation de l'App ;
   * avec : ré-autorisation de l'utilisateur pour cette installation (elle doit être de l'organisation).
   */
  async start(
    actor: AuditActor,
    input: { installationId?: string | undefined },
  ): Promise<{ url: string; expiresAt: string }> {
    const flow = this.flow;
    if (!flow) throw unavailable();
    const installationId = input.installationId ?? null;
    if (installationId !== null) {
      const known = await this.repository.findInstallation(actor.organizationId, installationId);
      if (!known || known.status === "deleted") throw notFound();
    }
    // Le slug est lu avant toute écriture et hors transaction : une panne ne laisse ni état ni audit.
    const slug = installationId === null ? await this.appSlug(flow) : null;
    const { state, nonce } = flow.signer.issue({ ...actor, installationId });
    const createdAt = this.clock.now();
    const expiresAt = new Date(Date.parse(createdAt) + STATE_TTL_MS).toISOString();
    const outcome = await this.repository.createState(actor, {
      nonce,
      installationId,
      createdAt,
      expiresAt,
    });
    if (outcome === "too_many_pending") throw validation("installationId", "too_many_pending");
    return { url: this.urlOf(flow, slug, state), expiresAt };
  }

  private async appSlug(flow: InstallationFlow): Promise<string> {
    try {
      return await flow.provider.appSlug();
    } catch (error) {
      if (error instanceof GitProviderError) throw unavailable();
      throw error;
    }
  }

  private urlOf(flow: InstallationFlow, slug: string | null, state: string): string {
    if (slug !== null) {
      const url = new URL(`${GITHUB}/apps/${encodeURIComponent(slug)}/installations/new`);
      url.searchParams.set("state", state);
      return url.toString();
    }
    const url = new URL(`${GITHUB}/login/oauth/authorize`);
    url.searchParams.set("client_id", flow.clientId);
    url.searchParams.set("redirect_uri", flow.redirectUri);
    url.searchParams.set("state", state);
    return url.toString();
  }
}

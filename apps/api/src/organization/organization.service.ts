import type {
  OrganizationCreateInput,
  OrganizationCreateOutput,
  OrganizationListOutput,
  OrgGetOutput,
  OrgUpdateInput,
  OrgUpdateOutput,
} from "@koklo/contract";
import { Inject, Injectable } from "@nestjs/common";
import { ORPCError } from "@orpc/server";
import { AUTH } from "../auth/auth.tokens.ts";
import type { Auth } from "../auth/auth.ts";
import type { AuthSession, UserSession } from "../auth/session.ts";
import { conflict } from "../tracker/api-errors.ts";
import { OrganizationRepository } from "./organization.repository.ts";
import { firstFreeSlug, slugify } from "./slug.ts";

const slugTaken = () => conflict("slug_taken");

@Injectable()
export class OrganizationService {
  constructor(
    @Inject(OrganizationRepository) private readonly repository: OrganizationRepository,
    @Inject(AUTH) private readonly auth: Auth,
  ) {}

  /**
   * Crée l'organisation, l'appelant en `owner` et l'entrée d'audit en une seule transaction, puis
   * l'active sur sa session (cookie des `headers`, via Better Auth : état de session idempotent,
   * hors périmètre de l'audit).
   */
  async create(
    input: OrganizationCreateInput,
    session: UserSession,
    headers: Headers,
  ): Promise<OrganizationCreateOutput> {
    const slug = await this.resolveSlug(input);
    let created: OrganizationCreateOutput;
    try {
      created = await this.repository.createWithOwner(session.userId, { name: input.name, slug });
    } catch (error) {
      // Course entre le contrôle et l'écriture : le slug a été pris entre-temps.
      if (await this.repository.slugExists(slug)) {
        throw slugTaken();
      }
      throw error;
    }
    await this.auth.api.setActiveOrganization({ body: { organizationId: created.id }, headers });
    return created;
  }

  list(userId: string): Promise<OrganizationListOutput> {
    return this.repository.listForUser(userId);
  }

  get(session: AuthSession): Promise<OrgGetOutput> {
    return this.repository.get(session.organizationId);
  }

  /** Nom et slug ; le slug est unique (409 `slug_taken`), y compris si la course se joue entre contrôle et écriture. */
  async update(session: AuthSession, input: OrgUpdateInput): Promise<OrgUpdateOutput> {
    try {
      return await this.repository.update(session, input, slugTaken);
    } catch (error) {
      if (error instanceof ORPCError) {
        throw error;
      }
      if (await this.repository.slugTakenByAnother(session.organizationId, input.slug)) {
        throw slugTaken();
      }
      throw error;
    }
  }

  private async resolveSlug({ name, slug }: OrganizationCreateInput): Promise<string> {
    if (slug !== undefined) {
      if (await this.repository.slugExists(slug)) {
        throw slugTaken();
      }
      return slug;
    }
    const base = slugify(name);
    return firstFreeSlug(base, await this.repository.slugsStartingWith(base));
  }
}

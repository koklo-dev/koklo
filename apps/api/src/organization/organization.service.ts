import type {
  OrganizationCreateInput,
  OrganizationCreateOutput,
  OrganizationListOutput,
} from "@koklo/contract";
import { Inject, Injectable } from "@nestjs/common";
import { ORPCError } from "@orpc/server";
import { AUTH } from "../auth/auth.tokens.ts";
import type { Auth } from "../auth/auth.ts";
import type { UserSession } from "../auth/session.ts";
import { OrganizationRepository } from "./organization.repository.ts";
import { firstFreeSlug, slugify } from "./slug.ts";

const slugTaken = () => new ORPCError("CONFLICT", { data: { reason: "slug_taken" } });

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

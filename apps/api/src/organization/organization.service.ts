import type {
  OrganizationCreateInput,
  OrganizationCreateOutput,
  OrganizationListOutput,
} from "@koklo/contract";
import { Inject, Injectable } from "@nestjs/common";
import { ORPCError } from "@orpc/server";
import { APIError } from "better-auth/api";
import { AUTH } from "../auth/auth.tokens.ts";
import type { Auth } from "../auth/auth.ts";
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
   * Crée l'organisation via le plugin Better Auth : l'appelant devient `owner` et l'organisation
   * devient active sur sa session (cookie des `headers`).
   */
  async create(
    input: OrganizationCreateInput,
    headers: Headers,
  ): Promise<OrganizationCreateOutput> {
    const slug = await this.resolveSlug(input);
    try {
      const created = await this.auth.api.createOrganization({
        body: { name: input.name, slug },
        headers,
      });
      return { id: created.id, name: created.name, slug: created.slug };
    } catch (error) {
      // Course entre le contrôle et l'écriture : le slug a été pris entre-temps.
      if (error instanceof APIError && (await this.repository.slugExists(slug))) {
        throw slugTaken();
      }
      throw error;
    }
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

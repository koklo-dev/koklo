import { contract } from "@koklo/contract";
import { Controller, Inject, Req, UseGuards } from "@nestjs/common";
import { Implement } from "@orpc/nest";
import { implement } from "@orpc/server";
import type { Request } from "express";
import { OriginGuard } from "../auth/origin.guard.ts";
import { MANAGER_ROLES } from "../auth/roles.ts";
import { RoleGuard, Roles, requireSession, SessionGuard } from "../auth/session.guard.ts";
import { viaCredential } from "../llm-credential/llm-credential-api.ts";
import { guard, requestIdOf } from "../request-context.ts";
import { AiProvidersService } from "./ai-providers.service.ts";
import { viaSettings } from "./ai-providers-api.ts";

/**
 * Fournisseurs d'IA de l'organisation de la session : `MANAGER_ROLES` partout, lectures comprises. L'organisation
 * et l'acteur viennent de la session, jamais de l'entrée. `OriginGuard` (niveau classe) contrôle l'origine
 * des écritures (CSRF). Aucune réponse ne porte la clé ni l'adresse de base.
 */
@Controller()
@UseGuards(OriginGuard)
export class AiProvidersController {
  constructor(@Inject(AiProvidersService) private readonly providers: AiProvidersService) {}

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...MANAGER_ROLES)
  @Implement(contract.aiProvider.list)
  list(@Req() request: Request) {
    return implement(contract.aiProvider.list).handler(({ errors }) =>
      guard(requestIdOf(request), errors, async () => ({
        items: await this.providers.list(requireSession(request).organizationId),
      })),
    );
  }

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...MANAGER_ROLES)
  @Implement(contract.aiProvider.add)
  add(@Req() request: Request) {
    return implement(contract.aiProvider.add).handler(({ input, errors }) =>
      guard(requestIdOf(request), errors, () =>
        viaCredential(() => {
          const { provider, ...key } = input;
          return this.providers.add(actorOf(request), requestIdOf(request), provider, key);
        }),
      ),
    );
  }

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...MANAGER_ROLES)
  @Implement(contract.aiProvider.verify)
  verify(@Req() request: Request) {
    return implement(contract.aiProvider.verify).handler(({ input, errors }) =>
      guard(requestIdOf(request), errors, () =>
        this.providers.verify(actorOf(request), requestIdOf(request), input.provider),
      ),
    );
  }

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...MANAGER_ROLES)
  @Implement(contract.aiProvider.replaceKey)
  replaceKey(@Req() request: Request) {
    return implement(contract.aiProvider.replaceKey).handler(({ input, errors }) =>
      guard(requestIdOf(request), errors, () =>
        viaCredential(() => {
          const { provider, ...key } = input;
          return this.providers.replaceKey(actorOf(request), requestIdOf(request), provider, key);
        }),
      ),
    );
  }

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...MANAGER_ROLES)
  @Implement(contract.aiProvider.remove)
  remove(@Req() request: Request) {
    return implement(contract.aiProvider.remove).handler(({ input, errors }) =>
      guard(requestIdOf(request), errors, async () => {
        await this.providers.remove(actorOf(request), input.provider);
        return { removed: true as const };
      }),
    );
  }

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...MANAGER_ROLES)
  @Implement(contract.aiProvider.setPrimary)
  setPrimary(@Req() request: Request) {
    return implement(contract.aiProvider.setPrimary).handler(({ input, errors }) =>
      guard(requestIdOf(request), errors, () =>
        viaSettings(() => this.providers.setPrimary(actorOf(request), input.provider)),
      ),
    );
  }
}

const actorOf = (request: Request) => {
  const { organizationId, userId } = requireSession(request);
  return { organizationId, userId };
};

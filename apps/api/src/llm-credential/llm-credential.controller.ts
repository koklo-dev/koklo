import { contract } from "@koklo/contract";
import { Controller, Inject, Req, UseGuards } from "@nestjs/common";
import { Implement } from "@orpc/nest";
import { implement } from "@orpc/server";
import type { Request } from "express";
import { MANAGER_ROLES } from "../auth/roles.ts";
import { RoleGuard, Roles, requireSession, SessionGuard } from "../auth/session.guard.ts";
import { guard, requestIdOf } from "../request-context.ts";
import { LlmCredentialService } from "./llm-credential.service.ts";
import { orKeyNotFound, toStatusOutput, viaCredential } from "./llm-credential-api.ts";

/**
 * Clés BYOK de l'organisation de la session : `MANAGER_ROLES` partout, `list` compris (CDC §14,
 * « clés BYOK »). L'organisation et l'acteur de l'audit viennent de la session, jamais de l'entrée.
 */
@Controller()
export class LlmCredentialController {
  constructor(@Inject(LlmCredentialService) private readonly service: LlmCredentialService) {}

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...MANAGER_ROLES)
  @Implement(contract.llmCredential.list)
  list(@Req() request: Request) {
    return implement(contract.llmCredential.list).handler(({ errors }) =>
      guard(requestIdOf(request), errors, async () => {
        const { organizationId } = requireSession(request);
        return { items: (await this.service.list(organizationId)).map(toStatusOutput) };
      }),
    );
  }

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...MANAGER_ROLES)
  @Implement(contract.llmCredential.set)
  set(@Req() request: Request) {
    return implement(contract.llmCredential.set).handler(({ input, errors }) =>
      guard(requestIdOf(request), errors, () =>
        viaCredential(async () => {
          const { organizationId, userId } = requireSession(request);
          const { provider, apiKey, defaultModel } = input;
          const status = await this.service.set(
            organizationId,
            provider,
            { apiKey, ...(defaultModel === undefined ? {} : { defaultModel }) },
            { organizationId, userId },
          );
          return toStatusOutput(status);
        }),
      ),
    );
  }

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...MANAGER_ROLES)
  @Implement(contract.llmCredential.remove)
  remove(@Req() request: Request) {
    return implement(contract.llmCredential.remove).handler(({ input, errors }) =>
      guard(requestIdOf(request), errors, async () => {
        const { organizationId, userId } = requireSession(request);
        orKeyNotFound(
          await this.service.remove(organizationId, input.provider, { organizationId, userId }),
        );
        return { removed: true as const };
      }),
    );
  }

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...MANAGER_ROLES)
  @Implement(contract.llmCredential.invalidate)
  invalidate(@Req() request: Request) {
    return implement(contract.llmCredential.invalidate).handler(({ input, errors }) =>
      guard(requestIdOf(request), errors, async () => {
        const { organizationId, userId } = requireSession(request);
        const status = await this.service.invalidate(organizationId, input.provider, {
          organizationId,
          userId,
        });
        return toStatusOutput(orKeyNotFound(status));
      }),
    );
  }
}

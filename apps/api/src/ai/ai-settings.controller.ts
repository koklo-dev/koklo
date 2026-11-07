import { contract } from "@koklo/contract";
import { Controller, Inject, Req, UseGuards } from "@nestjs/common";
import { Implement } from "@orpc/nest";
import { implement } from "@orpc/server";
import type { Request } from "express";
import { OriginGuard } from "../auth/origin.guard.ts";
import { MANAGER_ROLES } from "../auth/roles.ts";
import { RoleGuard, Roles, requireSession, SessionGuard } from "../auth/session.guard.ts";
import { guard, requestIdOf } from "../request-context.ts";
import { validation } from "../tracker/api-errors.ts";
import { settingsOutputOf, viaSettings } from "./ai-providers-api.ts";
import { AiSettingsService } from "./ai-settings.service.ts";
import { AI_CATALOG, type AiCatalog } from "./ai-tokens.ts";
import { AiUsageReportService } from "./ai-usage-report.service.ts";

const actorOf = (request: Request) => {
  const { organizationId, userId } = requireSession(request);
  return { organizationId, userId };
};

/**
 * Modèle par usage, secours, plafond, consommation et catalogue qualifié (TK-98) : `MANAGER_ROLES`
 * partout, lectures comprises. Organisation et acteur viennent de la session ; tout est validé par
 * `AiSettingsService`, jamais par l'écran.
 */
@Controller()
@UseGuards(OriginGuard)
export class AiSettingsController {
  constructor(
    @Inject(AiSettingsService) private readonly settings: AiSettingsService,
    @Inject(AiUsageReportService) private readonly reports: AiUsageReportService,
    @Inject(AI_CATALOG) private readonly catalog: AiCatalog,
  ) {}

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...MANAGER_ROLES)
  @Implement(contract.aiModel.listQualified)
  listQualified(@Req() request: Request) {
    return implement(contract.aiModel.listQualified).handler(({ errors }) =>
      guard(requestIdOf(request), errors, async () => ({
        items: this.catalog.list().map((entry) => ({ ...entry, usages: [...entry.usages] })),
      })),
    );
  }

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...MANAGER_ROLES)
  @Implement(contract.aiUsage.set)
  setUsage(@Req() request: Request) {
    return implement(contract.aiUsage.set).handler(({ input, errors }) =>
      guard(requestIdOf(request), errors, () =>
        viaSettings(async () => {
          const actor = actorOf(request);
          const { usage, provider, model } = input;
          if (provider === undefined || model === null) {
            await this.settings.clearUsageModel(actor, usage);
            return { usage, isDefault: true };
          }
          await this.settings.setUsageModel(actor, usage, { provider, model });
          return { usage, provider, model, isDefault: false };
        }),
      ),
    );
  }

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...MANAGER_ROLES)
  @Implement(contract.aiUsage.report)
  report(@Req() request: Request) {
    return implement(contract.aiUsage.report).handler(({ input, errors }) =>
      guard(requestIdOf(request), errors, async () => {
        try {
          const { state, ...report } = await this.reports.report(
            requireSession(request).organizationId,
            input.month,
          );
          return { ...report, providers: [...report.providers], capState: state };
        } catch (error) {
          if (error instanceof RangeError)
            throw validation("month", "mois attendu au format AAAA-MM");
          throw error;
        }
      }),
    );
  }

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...MANAGER_ROLES)
  @Implement(contract.aiSettings.get)
  get(@Req() request: Request) {
    return implement(contract.aiSettings.get).handler(({ errors }) =>
      guard(requestIdOf(request), errors, async () =>
        settingsOutputOf(await this.settings.get(requireSession(request).organizationId)),
      ),
    );
  }

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...MANAGER_ROLES)
  @Implement(contract.aiSettings.update)
  update(@Req() request: Request) {
    return implement(contract.aiSettings.update).handler(({ input, errors }) =>
      guard(requestIdOf(request), errors, () =>
        viaSettings(async () => {
          const actor = actorOf(request);
          await this.settings.update(actor, {
            ...(input.fallback === undefined ? {} : { fallback: input.fallback }),
            ...(input.fallbackEnabled === undefined
              ? {}
              : { fallbackEnabled: input.fallbackEnabled }),
            ...(input.monthlyCapMicroUsd === undefined
              ? {}
              : { monthlyCapMicroUsd: input.monthlyCapMicroUsd }),
          });
          return settingsOutputOf(await this.settings.get(actor.organizationId));
        }),
      ),
    );
  }
}

import type { IncomingMessage } from "node:http";
import { type LogDestination, setupObservability } from "@koklo/observability";
import { type DynamicModule, Module } from "@nestjs/common";
import { ORPCModule } from "@orpc/nest";
import { LoggerModule } from "nestjs-pino";
import { AiModule } from "./ai/ai.module.ts";
import { AuditModule } from "./audit/audit.module.ts";
import { AuthModule } from "./auth/auth.module.ts";
import { ClientSpaceModule } from "./client-space/client-space.module.ts";
import { ClockModule } from "./clock.ts";
import { CommentModule } from "./comment/comment.module.ts";
import type { AppConfig } from "./config.ts";
import { DatabaseModule } from "./database/database.module.ts";
import { ERROR_STATUS_MAP } from "./error-status.ts";
import { HealthModule } from "./health/health.module.ts";
import { IdeaModule } from "./idea/idea.module.ts";
import { validationStatusInterceptor } from "./input-validation.ts";
import { InstallationModule } from "./installation/installation.module.ts";
import { InvitationModule } from "./invitation/invitation.module.ts";
import { LeaseModule } from "./lease/lease.module.ts";
import { LlmCredentialRoutesModule } from "./llm-credential/llm-credential-routes.module.ts";
import { MeModule } from "./me/me.module.ts";
import { MemberModule } from "./member/member.module.ts";
import { NotificationModule } from "./notification/notification.module.ts";
import { OpenApiController } from "./openapi/openapi.controller.ts";
import { OrganizationModule } from "./organization/organization.module.ts";
import { ProjectModule } from "./project/project.module.ts";
import { ProjectAccessModule } from "./project/project-access.module.ts";
import { ProjectClientModule } from "./project-client/project-client.module.ts";
import { ProjectOverviewModule } from "./project-overview/project-overview.module.ts";
import { ProjectStateModule } from "./project-state/project-state.module.ts";
import { ProposalModule } from "./proposal/proposal.module.ts";
import { GitProviderModule } from "./repo/git-provider.module.ts";
import { RepoModule } from "./repo/repo.module.ts";
import { requestIdFrom } from "./request-context.ts";
import { useRequestLogger } from "./request-logger.ts";
import { serializeRequest, serializeResponse } from "./request-serializer.ts";
import { ReviewModule } from "./review/review.module.ts";
import { SearchModule } from "./search/search.module.ts";
import { SpecBatchModule } from "./spec-batch/spec-batch.module.ts";
import { SpecDataModule } from "./spec-data/spec-data.module.ts";
import { SpecDeliverablesModule } from "./spec-deliverables/spec-deliverables.module.ts";
import { SpecItemModule } from "./spec-item/spec-item.module.ts";
import { SpecMigrationModule } from "./spec-migration/spec-migration.module.ts";
import { SpecReadModule } from "./spec-read/spec-read.module.ts";
import { SprintModule } from "./sprint/sprint.module.ts";
import { SprintImportModule } from "./sprint-import/sprint-import.module.ts";
import { SuggestionModule } from "./suggestion/suggestion.module.ts";
import { TicketModule } from "./ticket/ticket.module.ts";
import { WebhookModule } from "./webhook/webhook.module.ts";

export interface AppModuleOptions {
  /** Destination des lignes de journal (défaut : stdout) ; les tests y lisent le JSON émis. */
  logStream?: LogDestination;
}

const requestIdOfMessage = (request: IncomingMessage): string =>
  requestIdFrom(request.headers["x-request-id"]);

/** Espace client (TK-55) : lectures, suggestions, validation et l'émetteur de notifications partagé. */
const CLIENT_SPACE_MODULES = [
  ClientSpaceModule,
  NotificationModule,
  SuggestionModule,
  ReviewModule,
];

/** Réglages (TK-97) : membres, invitations avec projets, compte et préférences. */
const SETTINGS_MODULES = [MemberModule, InvitationModule, MeModule];

/** Projets (TK-92) : liste, création, coquille, puis la vue d'ensemble. */
const PROJECT_MODULES = [ProjectModule, ProjectOverviewModule];

/** Écriture des lots (TK-44b) et migration du format (TK-106), puis lecture de la spec (TK-48d), livrables (TK-100) et éléments (TK-101). */
const SPEC_MODULES = [
  SpecBatchModule,
  SpecMigrationModule,
  SpecReadModule,
  SpecDeliverablesModule,
  SpecItemModule,
  SpecDataModule,
];

/** IA (TK-95) puis propositions de l'agent (TK-99a) : le second dépend du premier. */
const AI_MODULES = [AiModule, ProposalModule];

@Module({})
export class AppModule {
  static forRoot(config: AppConfig, options: AppModuleOptions = {}): DynamicModule {
    const logger = setupObservability({
      dsn: config.sentryDsn,
      environment: config.appEnv,
      release: config.appVersion,
      level: config.logLevel,
      destination: options.logStream,
    });
    useRequestLogger(logger);
    return {
      module: AppModule,
      imports: [
        LoggerModule.forRoot({
          pinoHttp: {
            logger,
            genReqId: requestIdOfMessage,
            serializers: { req: serializeRequest, res: serializeResponse },
            customLogLevel: (_request, response, error) =>
              error || response.statusCode >= 500 ? "error" : "info",
            customProps: (request) => ({ requestId: request.id }),
          },
        }),
        ClockModule,
        DatabaseModule.forRoot(config),
        AuthModule.forRoot(config),
        ORPCModule.forRoot({
          errorStatusMap: ERROR_STATUS_MAP,
          clientInterceptors: [validationStatusInterceptor],
        }),
        HealthModule,
        OrganizationModule,
        ...SETTINGS_MODULES,
        ProjectAccessModule,
        ...PROJECT_MODULES,
        ProjectClientModule,
        TicketModule,
        SprintModule,
        SprintImportModule,
        LeaseModule,
        ProjectStateModule,
        CommentModule,
        AuditModule,
        GitProviderModule.forRoot(config),
        RepoModule,
        InstallationModule,
        LlmCredentialRoutesModule,
        ...AI_MODULES,
        IdeaModule,
        ...SPEC_MODULES,
        SearchModule,
        ...CLIENT_SPACE_MODULES,
        WebhookModule,
      ],
      controllers: [OpenApiController],
    };
  }
}

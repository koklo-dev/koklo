import type { z } from "zod";
import { ai } from "./contract-ai.ts";
import { aiModel, aiProvider, aiSettings, aiUsage } from "./contract-ai-providers.ts";
import { clientSpace } from "./contract-client-space.ts";
import { audit, comment, lease, projectState } from "./contract-collaboration.ts";
import { idea } from "./contract-idea.ts";
import { llmCredential } from "./contract-llm-credential.ts";
import { projectClient } from "./contract-project-client.ts";
import { installation, repo } from "./contract-provider.ts";
import { review } from "./contract-review.ts";
import { invitation, me, memberSettings, org } from "./contract-settings.ts";
import { projectShell, search } from "./contract-shell.ts";
import { spec, specBatch } from "./contract-spec.ts";
import { suggestion } from "./contract-suggestion.ts";
import { dependency, sprint, ticket } from "./contract-tickets.ts";
import {
  authErrors,
  conflictError,
  forbiddenOf,
  internalError,
  notFoundError,
  unauthorizedError,
} from "./errors.ts";
import { route } from "./route-helpers.ts";
import type {
  auditEntrySchema,
  commentCreateInputSchema,
  commentSchema,
  dependencyAddInputSchema,
  leaseAcquireInputSchema,
  leaseSchema,
  projectStateSchema,
  projectStateUpdateInputSchema,
  sprintCreateInputSchema,
  sprintSchema,
  ticketCreateInputSchema,
  ticketDetailSchema,
  ticketSchema,
  ticketStatusSchema,
  ticketTransitionInputSchema,
} from "./schemas.ts";
import {
  healthInputSchema,
  healthOutputSchema,
  memberInviteInputSchema,
  memberInviteOutputSchema,
  memberListOutputSchema,
  type memberRoleSchema,
  memberSetRoleInputSchema,
  memberSetRoleOutputSchema,
  organizationCreateInputSchema,
  organizationCreateOutputSchema,
  organizationListOutputSchema,
  projectCreateInputSchema,
  projectListOutputSchema,
  projectSchema,
  type roleSchema,
} from "./schemas.ts";
import type {
  ideaListOutputSchema,
  ideaPageSchema,
  ideaPageSummarySchema,
  ideaPresenceOutputSchema,
} from "./schemas-idea.ts";
import type { projectClientSchema } from "./schemas-project-client.ts";
import type { installationSchema, repoSchema } from "./schemas-provider.ts";
import type {
  invitationCreateInputSchema,
  invitationListOutputSchema,
  invitationSchema,
  memberPageInputSchema,
  memberPageOutputSchema,
  memberRemoveOutputSchema,
  memberUpdateRoleOutputSchema,
  meNotificationsOutputSchema,
  meOutputSchema,
  orgGetOutputSchema,
  orgUpdateInputSchema,
  orgUpdateOutputSchema,
} from "./schemas-settings.ts";
import type {
  featureDetailSchema,
  featureSummarySchema,
  specBatchSchema,
  specBatchSubmitInputSchema,
  specHeadSchema,
  specOperationSchema,
  validationReportSchema,
} from "./schemas-spec.ts";

const health = route("GET", "/health")
  .errors(internalError)
  .input(healthInputSchema)
  .output(healthOutputSchema);

const projectList = route("GET", "/projects")
  .errors({ ...internalError, ...authErrors })
  .output(projectListOutputSchema);

/** TK-55 : un compte dont toutes les adhésions sont « client » ne crée pas d'organisation. */
const organizationCreate = route("POST", "/organizations")
  .errors({
    ...internalError,
    ...unauthorizedError,
    ...forbiddenOf("client_only"),
    ...conflictError,
  })
  .input(organizationCreateInputSchema)
  .output(organizationCreateOutputSchema);

const organizationList = route("GET", "/organizations")
  .errors({ ...internalError, ...unauthorizedError })
  .output(organizationListOutputSchema);

const memberInvite = route("POST", "/members/invitations")
  .errors({ ...internalError, ...authErrors, ...conflictError })
  .input(memberInviteInputSchema)
  .output(memberInviteOutputSchema);

const memberList = route("GET", "/members")
  .errors({ ...internalError, ...authErrors })
  .output(memberListOutputSchema);

const memberSetRole = route("PATCH", "/members/{memberId}/role")
  .errors({ ...internalError, ...authErrors, ...notFoundError, ...conflictError })
  .input(memberSetRoleInputSchema)
  .output(memberSetRoleOutputSchema);

const projectCreate = route("POST", "/projects")
  .errors({ ...internalError, ...authErrors })
  .input(projectCreateInputSchema)
  .output(projectSchema);

export const contract = {
  health,
  organization: { create: organizationCreate, list: organizationList },
  org,
  invitation,
  // `invite`, `list`, `setRole` : dépréciées depuis 2.2.0 (B95), retirées à la prochaine majeure ; mêmes services que les routes de `memberSettings`.
  member: { invite: memberInvite, list: memberList, setRole: memberSetRole, ...memberSettings },
  me,
  project: { list: projectList, create: projectCreate, ...projectShell },
  projectClient,
  search,
  clientSpace,
  suggestion,
  idea,
  review,
  ticket,
  dependency,
  sprint,
  comment,
  projectState,
  lease,
  audit,
  installation,
  llmCredential,
  ai,
  aiProvider,
  aiModel,
  aiUsage,
  aiSettings,
  repo,
  spec,
  specBatch,
};

export type HealthInput = z.input<typeof healthInputSchema>;
export type HealthOutput = z.output<typeof healthOutputSchema>;
export type ProjectListOutput = z.output<typeof projectListOutputSchema>;
export type ProjectCreateInput = z.input<typeof projectCreateInputSchema>;
export type OrganizationCreateInput = z.input<typeof organizationCreateInputSchema>;
export type OrganizationCreateOutput = z.output<typeof organizationCreateOutputSchema>;
export type OrganizationListOutput = z.output<typeof organizationListOutputSchema>;
export type MemberInviteInput = z.input<typeof memberInviteInputSchema>;
export type MemberInviteOutput = z.output<typeof memberInviteOutputSchema>;
export type MemberListOutput = z.output<typeof memberListOutputSchema>;
export type MemberSetRoleInput = z.input<typeof memberSetRoleInputSchema>;
export type MemberSetRoleOutput = z.output<typeof memberSetRoleOutputSchema>;
export type OrgGetOutput = z.output<typeof orgGetOutputSchema>;
export type OrgUpdateInput = z.input<typeof orgUpdateInputSchema>;
export type OrgUpdateOutput = z.output<typeof orgUpdateOutputSchema>;
export type InvitationCreateInput = z.input<typeof invitationCreateInputSchema>;
export type InvitationOutput = z.output<typeof invitationSchema>;
export type InvitationListOutput = z.output<typeof invitationListOutputSchema>;
export type MemberPageInput = z.input<typeof memberPageInputSchema>;
export type MemberPageOutput = z.output<typeof memberPageOutputSchema>;
export type MemberUpdateRoleOutput = z.output<typeof memberUpdateRoleOutputSchema>;
export type MemberRemoveOutput = z.output<typeof memberRemoveOutputSchema>;
export type MeOutput = z.output<typeof meOutputSchema>;
export type MeNotificationsOutput = z.output<typeof meNotificationsOutputSchema>;
export type Role = z.output<typeof roleSchema>;
export type MemberRole = z.output<typeof memberRoleSchema>;
export type TicketCreateInput = z.input<typeof ticketCreateInputSchema>;
export type TicketTransitionInput = z.input<typeof ticketTransitionInputSchema>;
export type TicketOutput = z.output<typeof ticketSchema>;
export type TicketDetail = z.output<typeof ticketDetailSchema>;
export type TicketStatus = z.output<typeof ticketStatusSchema>;
export type DependencyAddInput = z.input<typeof dependencyAddInputSchema>;
export type SprintCreateInput = z.input<typeof sprintCreateInputSchema>;
export type SprintOutput = z.output<typeof sprintSchema>;
export type CommentCreateInput = z.input<typeof commentCreateInputSchema>;
export type CommentOutput = z.output<typeof commentSchema>;
export type ProjectStateUpdateInput = z.input<typeof projectStateUpdateInputSchema>;
export type ProjectStateOutput = z.output<typeof projectStateSchema>;
export type LeaseAcquireInput = z.input<typeof leaseAcquireInputSchema>;
export type LeaseOutput = z.output<typeof leaseSchema>;
export type AuditEntry = z.output<typeof auditEntrySchema>;
export type RepoOutput = z.output<typeof repoSchema>;
export type InstallationOutput = z.output<typeof installationSchema>;
export type SpecHeadOutput = z.output<typeof specHeadSchema>;
export type FeatureSummary = z.output<typeof featureSummarySchema>;
export type FeatureDetail = z.output<typeof featureDetailSchema>;
export type SpecOperation = z.input<typeof specOperationSchema>;
export type SpecBatchSubmitInput = z.input<typeof specBatchSubmitInputSchema>;
export type SpecBatchOutput = z.output<typeof specBatchSchema>;
export type ValidationReport = z.output<typeof validationReportSchema>;
export type ProjectClient = z.output<typeof projectClientSchema>;
export type IdeaPage = z.output<typeof ideaPageSchema>;
export type IdeaPageSummary = z.output<typeof ideaPageSummarySchema>;
export type IdeaListOutput = z.output<typeof ideaListOutputSchema>;
export type IdeaPresenceOutput = z.output<typeof ideaPresenceOutputSchema>;

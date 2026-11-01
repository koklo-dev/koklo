import type { z } from "zod";
import { ai } from "./contract-ai.ts";
import { audit, comment, lease, projectState } from "./contract-collaboration.ts";
import { llmCredential } from "./contract-llm-credential.ts";
import { projectClient } from "./contract-project-client.ts";
import { installation, repo } from "./contract-provider.ts";
import { spec, specBatch } from "./contract-spec.ts";
import { dependency, sprint, ticket } from "./contract-tickets.ts";
import {
  authErrors,
  conflictError,
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
import type { projectClientSchema } from "./schemas-project-client.ts";
import type { installationSchema, repoSchema } from "./schemas-provider.ts";
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

const organizationCreate = route("POST", "/organizations")
  .errors({ ...internalError, ...unauthorizedError, ...conflictError })
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
  .errors({ ...internalError, ...unauthorizedError })
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
  member: { invite: memberInvite, list: memberList, setRole: memberSetRole },
  project: { list: projectList, create: projectCreate },
  projectClient,
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

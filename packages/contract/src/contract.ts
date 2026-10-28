import { oc } from "@orpc/contract";
import { openapi } from "@orpc/openapi";
import type { z } from "zod";
import {
  authErrors,
  conflictError,
  internalError,
  notFoundError,
  unauthorizedError,
} from "./errors.ts";
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

const health = oc
  .meta(openapi({ method: "GET", path: "/health" }))
  .errors(internalError)
  .input(healthInputSchema)
  .output(healthOutputSchema);

const projectList = oc
  .meta(openapi({ method: "GET", path: "/projects" }))
  .errors({ ...internalError, ...authErrors })
  .output(projectListOutputSchema);

const organizationCreate = oc
  .meta(openapi({ method: "POST", path: "/organizations" }))
  .errors({ ...internalError, ...unauthorizedError, ...conflictError })
  .input(organizationCreateInputSchema)
  .output(organizationCreateOutputSchema);

const organizationList = oc
  .meta(openapi({ method: "GET", path: "/organizations" }))
  .errors({ ...internalError, ...unauthorizedError })
  .output(organizationListOutputSchema);

const memberInvite = oc
  .meta(openapi({ method: "POST", path: "/members/invitations" }))
  .errors({ ...internalError, ...authErrors, ...conflictError })
  .input(memberInviteInputSchema)
  .output(memberInviteOutputSchema);

const memberList = oc
  .meta(openapi({ method: "GET", path: "/members" }))
  .errors({ ...internalError, ...unauthorizedError })
  .output(memberListOutputSchema);

const memberSetRole = oc
  .meta(openapi({ method: "PATCH", path: "/members/{memberId}/role" }))
  .errors({ ...internalError, ...authErrors, ...notFoundError, ...conflictError })
  .input(memberSetRoleInputSchema)
  .output(memberSetRoleOutputSchema);

const projectCreate = oc
  .meta(openapi({ method: "POST", path: "/projects" }))
  .errors({ ...internalError, ...authErrors })
  .input(projectCreateInputSchema)
  .output(projectSchema);

export const contract = {
  health,
  organization: { create: organizationCreate, list: organizationList },
  member: { invite: memberInvite, list: memberList, setRole: memberSetRole },
  project: { list: projectList, create: projectCreate },
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

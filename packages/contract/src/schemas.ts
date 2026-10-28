import { z } from "zod";

export const healthInputSchema = z.object({});

export const healthOutputSchema = z.object({
  status: z.literal("ok"),
  version: z.string(),
});

export const projectSchema = z.object({
  id: z.uuid(),
  name: z.string(),
});

export const projectListOutputSchema = z.array(projectSchema);

/** Rôles du CDC §14 ; `owner` n'est jamais attribuable par invitation ou changement de rôle. */
export const roleSchema = z.enum(["owner", "admin", "dev", "designer", "client", "business"]);
export const memberRoleSchema = roleSchema.exclude(["owner"]);

export const projectCreateInputSchema = z.object({ name: z.string().min(1).max(100) });

export const organizationCreateInputSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z
    .string()
    .min(2)
    .max(48)
    .regex(/^[a-z0-9-]+$/)
    .optional(),
});
export const organizationCreateOutputSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  slug: z.string(),
});
export const organizationListOutputSchema = z.array(
  organizationCreateOutputSchema.extend({ role: roleSchema }),
);

export const memberInviteInputSchema = z.object({ email: z.email(), role: memberRoleSchema });
export const memberInviteOutputSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  role: memberRoleSchema,
  status: z.literal("pending"),
  expiresAt: z.iso.datetime(),
});

export const memberListOutputSchema = z.array(
  z.object({
    id: z.uuid(),
    userId: z.uuid(),
    name: z.string(),
    email: z.email(),
    role: roleSchema,
  }),
);

export const memberSetRoleInputSchema = z.object({ memberId: z.uuid(), role: memberRoleSchema });
export const memberSetRoleOutputSchema = z.object({ id: z.uuid(), role: memberRoleSchema });

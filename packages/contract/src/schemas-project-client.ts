import { z } from "zod";

/** Client lié à un projet (TK-55a) : la fiche du membre et la date de liaison, rien d'interne. */
export const projectClientSchema = z.object({
  memberId: z.uuid(),
  userId: z.uuid(),
  name: z.string(),
  email: z.email(),
  createdAt: z.iso.datetime(),
});

export const projectClientListInputSchema = z.object({ projectId: z.uuid() });
export const projectClientAddInputSchema = z.object({ projectId: z.uuid(), memberId: z.uuid() });
export const projectClientRemoveInputSchema = projectClientAddInputSchema;
export const projectClientRemoveOutputSchema = z.object({ removed: z.boolean() });

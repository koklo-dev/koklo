import { z } from "zod";
import { roleSchema } from "./schemas.ts";
import { featureIdSchema } from "./schemas-spec.ts";
import { pageInputSchema, pageOf } from "./schemas-tickets.ts";

/** Taille maximale du corps d'une suggestion et de la note de décision (TK-55c). */
export const SUGGESTION_BODY_MAX = 5000;
export const SUGGESTION_NOTE_MAX = 2000;

/** Contrôles refusés : tout C0 sauf tabulation, saut de ligne et retour chariot, plus DEL. */
const isControl = (code: number): boolean =>
  (code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) || code === 0x7f;

/** Substitut UTF-16 isolé : PostgreSQL refuserait l'écriture (erreur 500 sinon). */
const hasLoneSurrogate = (text: string): boolean => {
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = text.charCodeAt(i + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true;
      i += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return true;
    }
  }
  return false;
};

const isCleanText = (text: string): boolean =>
  !hasLoneSurrogate(text) && ![...text].some((char) => isControl(char.charCodeAt(0)));

/** Texte libre du client ou de l'équipe : conservé tel quel (hors trim), sans contrôle ni substitut isolé. */
const CLEAN_MESSAGE = "Caractères de contrôle ou substitut isolé interdits";

export const suggestionTargetKindSchema = z.enum(["feature", "project"]);
export const suggestionStatusSchema = z.enum(["open", "accepted", "rejected", "withdrawn"]);
export const suggestionKeySchema = z.string().regex(/^SG-[1-9]\d*$/);

/** L'auteur, son rôle, la clé, le SHA de base et le statut sont posés par le serveur. */
export const suggestionCreateInputSchema = z
  .object({
    projectId: z.uuid(),
    targetKind: suggestionTargetKindSchema,
    targetRef: featureIdSchema.optional(),
    body: z.string().trim().min(1).max(SUGGESTION_BODY_MAX).refine(isCleanText, CLEAN_MESSAGE),
  })
  .refine((value) => (value.targetKind === "feature") === (value.targetRef !== undefined), {
    message: "targetRef est requis pour une feature et interdit pour le projet",
    path: ["targetRef"],
  });

export const suggestionListInputSchema = z.object({
  projectId: z.uuid(),
  status: suggestionStatusSchema.optional(),
  targetRef: z.string().min(1).max(64).optional(),
  ...pageInputSchema,
});

export const suggestionWithdrawInputSchema = z.object({ projectId: z.uuid(), id: z.uuid() });

export const suggestionDecideInputSchema = suggestionWithdrawInputSchema.extend({
  note: z.string().max(SUGGESTION_NOTE_MAX).refine(isCleanText, CLEAN_MESSAGE).optional(),
});

/** Jamais de SHA, d'identité d'auteur ni d'organisation ; `authorRole` réservé à l'équipe. */
export const suggestionSchema = z.object({
  id: z.uuid(),
  key: suggestionKeySchema,
  targetKind: suggestionTargetKindSchema,
  targetRef: featureIdSchema.nullable(),
  body: z.string(),
  status: suggestionStatusSchema,
  decisionNote: z.string().nullable(),
  createdAt: z.iso.datetime(),
  decidedAt: z.iso.datetime().nullable(),
  mine: z.boolean(),
  outdated: z.boolean(),
  authorRole: roleSchema.optional(),
});

export const suggestionListOutputSchema = pageOf(suggestionSchema);

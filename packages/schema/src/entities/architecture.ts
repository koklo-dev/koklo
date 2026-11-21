import { z } from "zod";
import { adrId, componentId, featureId, flowId, PATTERNS, roleId, ruleId, tableId } from "./ids.ts";

const line = z.string().min(1);

export const COMPONENT_TYPES = ["app", "service", "store", "queue", "ext"] as const;

const dependency = z.strictObject({
  vers: componentId,
  /** Canal de la dépendance (`SQL`, `HTTP`, `AMQP`…). */
  via: line,
  /** Absent : appel synchrone ; seul le mode asynchrone échappe à la détection de cycle. */
  mode: z.literal("asynchrone").optional(),
});

/** Composant `architecture/components/<slug>.yaml` (TK-111, passation 10 §4). */
export const ComponentSchema = z.strictObject({
  id: componentId,
  nom: line,
  type: z.enum(COMPONENT_TYPES),
  zone: line,
  responsabilite: line,
  possede: z.array(tableId).default([]),
  sert: z.array(featureId).default([]),
  depend_de: z.array(dependency).default([]),
  decisions: z.array(adrId).default([]),
  resume_client: z.array(line).optional(),
});

const participantId = z.union([componentId, roleId]);

const message = z.strictObject({
  de: participantId,
  vers: participantId,
  texte: line,
  retour: line.optional(),
  erreur: line.optional(),
});
const altBlock = z.strictObject({
  bloc: z.literal("alt"),
  libelle: line,
  messages: z.array(message).min(1),
});
const separator = z.strictObject({ bloc: z.literal("separateur"), libelle: line });
const item = z.union([message, altBlock, separator]);

type Item = z.output<typeof item>;

/** Messages d'un élément du flux, blocs `alt` compris. */
function messagesOf(entry: Item): z.output<typeof message>[] {
  if ("bloc" in entry) return entry.bloc === "alt" ? entry.messages : [];
  return [entry];
}

/** Flux technique `architecture/flows/<P-id>.yaml` : même identifiant que le parcours métier qu'il détaille. */
export const ArchFlowSchema = z
  .strictObject({
    id: flowId,
    participants: z.array(participantId).min(1),
    messages: z.array(item).min(1),
    fonctionnalites: z.array(featureId).default([]),
    regles: z.array(ruleId).default([]),
    decisions: z.array(adrId).default([]),
  })
  .superRefine((flow, ctx) => {
    const known = new Set(flow.participants);
    flow.messages.forEach((entry, i) => {
      for (const sent of messagesOf(entry)) {
        for (const who of [sent.de, sent.vers]) {
          if (known.has(who)) continue;
          ctx.addIssue({
            code: "custom",
            message: `le participant ${who} n'est pas déclaré dans participants`,
            path: ["messages", i],
          });
        }
      }
    });
  });

/** `architecture/actors.yaml` : acteurs dérivés des rôles `RL-` (hors modèle, tolérant côté lecture). */
export const ActorsFileSchema = z.strictObject({
  acteurs: z.array(z.strictObject({ id: roleId, nom: line })).default([]),
});

export const ADR_STATUSES = ["proposee", "acceptee", "remplacee"] as const;

const adrLink = z
  .string()
  .regex(
    new RegExp(
      [PATTERNS.feature, PATTERNS.table, PATTERNS.component, PATTERNS.rule, PATTERNS.flow]
        .map((pattern) => pattern.source)
        .join("|"),
    ),
  );

/** Front matter d'une décision `architecture/adr/ADR-<nnn>-<slug>.md`. */
export const AdrFrontSchema = z.strictObject({
  id: adrId,
  titre: line,
  statut: z.enum(ADR_STATUSES),
  remplacee_par: adrId.optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  decideurs: z.array(line).default([]),
  liens: z.array(adrLink).default([]),
});

/** Décision complète : front matter plus sections Contexte, Décision, Conséquences, Alternatives, En clair. */
export const AdrSchema = AdrFrontSchema.extend({
  contexte: line,
  decision: line,
  consequences: z.strictObject({
    positives: z.array(line).default([]),
    a_accepter: z.array(line).default([]),
  }),
  alternatives: z.array(z.strictObject({ nom: line, raison: line })).default([]),
  en_clair: line.optional(),
});

export type Component = z.output<typeof ComponentSchema>;
export type ComponentType = Component["type"];
export type ArchFlow = z.output<typeof ArchFlowSchema>;
export type ArchFlowItem = Item;
export type ActorsFile = z.output<typeof ActorsFileSchema>;
export type AdrFront = z.output<typeof AdrFrontSchema>;
export type Adr = z.output<typeof AdrSchema>;

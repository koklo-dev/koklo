import { z } from "zod";
import { fixtureId, PATTERNS, tableId } from "./ids.ts";

/** Nombre de lignes d'un jeu écrit dans la spec (le volume réel est généré côté serveur, TK-110). */
export const FIXTURE_ROWS_MAX = 200;
/** Avec un bloc `generation`, les lignes stockées sont l'amorce : 50 au plus (B485). */
export const FIXTURE_GENERATED_STORED_MAX = 50;
export const FIXTURE_TOTAL_MAX = 100000;

/** Domaines réservés : les données d'un jeu sont toujours fictives (B383). */
export const RESERVED_EMAIL_DOMAINS = [
  "exemple.fr",
  "exemple.com",
  "example.com",
  "example.org",
  "example.net",
] as const;

const EMAIL_LIKE = /[^\s@]+@([^\s@]+)/g;

/** Domaines des adresses qui ressemblent à un e-mail dans `value`, hors liste réservée. */
const foreignDomains = (value: string): string[] =>
  [...value.matchAll(EMAIL_LIKE)]
    .map((match) => (match[1] ?? "").toLowerCase().replace(/[.,;:!?)]+$/, ""))
    .filter((domain) => !(RESERVED_EMAIL_DOMAINS as readonly string[]).includes(domain));

/** Vrai si `value` contient une adresse e-mail dont le domaine n'est pas réservé (données toujours fictives). */
export const hasForeignEmailDomain = (value: string): boolean => foreignDomains(value).length > 0;

const FIELD_KEY = z.string().regex(PATTERNS.fieldName);
const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** Règles fermées d'un champ généré : la valeur de la ligne k ne dépend que de (graine, k). */
export const FixtureRuleSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("sequence"),
    prefixe: z.string().max(40).optional(),
    debut: z.number().int().min(0).optional(),
  }),
  z.strictObject({
    type: z.literal("choix"),
    valeurs: z.array(z.string().min(1).max(100)).min(1).max(50),
  }),
  z.strictObject({ type: z.literal("entier"), min: z.number().int(), max: z.number().int() }),
  z.strictObject({
    type: z.literal("date"),
    debut: isoDay,
    jours: z.number().int().min(0).max(36500),
  }),
  z.strictObject({ type: z.literal("nom") }),
  z.strictObject({ type: z.literal("email") }),
]);
export type FixtureRule = z.output<typeof FixtureRuleSchema>;

/** Bloc `generation` : `total` lignes au plus 100 000, les lignes au-delà de `lignes` sont générées à la demande. */
export const FixtureGenerationSchema = z.strictObject({
  graine: z.number().int().min(0),
  total: z.number().int().min(1).max(FIXTURE_TOTAL_MAX),
  regles: z.record(FIELD_KEY, FixtureRuleSchema),
});
export type FixtureGeneration = z.output<typeof FixtureGenerationSchema>;

const scalar = z.union([z.string(), z.number(), z.boolean()]);

/** Jeu d'exemple `data/fixtures/FX-<slug>.yaml` (B383) : lignes typées d'après la table, valeurs fictives. */
export const FixtureSchema = z
  .strictObject({
    id: fixtureId,
    titre: z.string().min(1),
    table: tableId,
    locale: z
      .string()
      .regex(/^[a-z]{2}(-[A-Z]{2})?$/)
      .default("fr-FR"),
    lignes: z.array(z.record(FIELD_KEY, scalar)).max(FIXTURE_ROWS_MAX),
    generation: FixtureGenerationSchema.optional(),
  })
  .superRefine((fixture, context) => {
    const { generation, lignes } = fixture;
    if (generation !== undefined && lignes.length > FIXTURE_GENERATED_STORED_MAX) {
      context.addIssue({
        code: "custom",
        path: ["lignes"],
        message: `Avec generation, au plus ${FIXTURE_GENERATED_STORED_MAX} lignes stockées`,
      });
    }
    if (generation !== undefined && generation.total < lignes.length) {
      context.addIssue({
        code: "custom",
        path: ["generation", "total"],
        message: "Le total ne peut pas être inférieur au nombre de lignes stockées",
      });
    }
    fixture.lignes.forEach((row, index) => {
      for (const [key, value] of Object.entries(row)) {
        if (typeof value !== "string" || !hasForeignEmailDomain(value)) continue;
        context.addIssue({
          code: "custom",
          path: ["lignes", index, key],
          message:
            "Une adresse e-mail d'un jeu d'exemple porte un domaine réservé (exemple.fr, exemple.com, example.com, example.org, example.net)",
        });
      }
    });
  });

export type Fixture = z.output<typeof FixtureSchema>;

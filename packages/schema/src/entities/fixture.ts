import { z } from "zod";
import { fixtureId, PATTERNS, tableId } from "./ids.ts";

/** Nombre de lignes d'un jeu écrit dans la spec (le volume réel est généré côté serveur, TK-110). */
export const FIXTURE_ROWS_MAX = 200;

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
    lignes: z.array(z.record(z.string().regex(PATTERNS.fieldName), scalar)).max(FIXTURE_ROWS_MAX),
  })
  .superRefine((fixture, context) => {
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

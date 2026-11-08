import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { IDEA_TEMPLATE } from "../src/idea/idea-template.ts";

/**
 * TK-89 (T6) : le gabarit « cadrage par défaut » en TypeScript est le miroir exact des lignes que la
 * migration écrit pour les projets existants (slug, titre, requise, position).
 */
const MIGRATION = resolve(
  import.meta.dirname,
  "../../../packages/db/prisma/migrations/20261108090000_idea/migration.sql",
);

describe("idea-template", () => {
  it("compte 10 entrées dont 4 requises : Vision, Problème, Utilisateurs, Périmètre", () => {
    expect(IDEA_TEMPLATE).toHaveLength(10);
    expect(IDEA_TEMPLATE.filter((e) => e.required).map((e) => e.title)).toEqual([
      "Vision",
      "Problème",
      "Utilisateurs",
      "Périmètre",
    ]);
  });

  it("l'ordre est celui de la passation : Parcours en 04, Périmètre en 05", () => {
    expect(IDEA_TEMPLATE.map((e) => e.slug)).toEqual([
      "vision",
      "probleme",
      "utilisateurs",
      "proposition-valeur",
      "parcours",
      "perimetre",
      "contraintes",
      "mesure",
      "hypotheses-risques",
      "glossaire",
    ]);
  });

  it("les slugs respectent le motif du worker", () => {
    for (const entry of IDEA_TEMPLATE) expect(entry.slug).toMatch(/^[a-z0-9-]{1,40}$/);
  });

  it("titres, slugs, positions et requises égalent les valeurs SQL de la migration", () => {
    const sql = readFileSync(MIGRATION, "utf8");
    const rows = [...sql.matchAll(/\((\d), '([a-z0-9-]+)', '([^']+)', (true|false)\)/g)].map(
      (m) => ({
        position: Number(m[1]),
        slug: m[2],
        title: m[3],
        required: m[4] === "true",
      }),
    );
    expect(rows).toEqual(
      IDEA_TEMPLATE.map((e, position) => ({
        position,
        slug: e.slug,
        title: e.title,
        required: e.required,
      })),
    );
  });
});

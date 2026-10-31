import { specBatchSubmitInputSchema, specOperationSchema } from "@koklo/contract";
import { describe, expect, it } from "vitest";
import { EMPTY_VALUES, type FeatureFormValues, valuesFromDetail } from "../src/lib/feature-form.ts";
import {
  buildCreateOperation,
  buildSubmitInput,
  buildUpdateOperation,
} from "../src/lib/feature-operation.ts";
import { DETAIL_TYPED as DETAIL } from "./support/feature-form.tsx";
import { PROJECT_ID, SHA } from "./support/features.tsx";

/**
 * TK-48 / 48e : construction de l'opération et de l'entrée de `specBatch.submit` (S-feature-form §5.2).
 * Ne contient que des champs du contrat ; la sortie passe le schéma d'entrée du contrat 0.7.0.
 */
const KEY = "feature-0a1b2c3d-1111-4222-8333-444455556666";
const base = (over: Partial<FeatureFormValues> = {}): FeatureFormValues => ({
  ...EMPTY_VALUES,
  title: "Nouvelle",
  priority: "should",
  ...over,
});
const baseline = valuesFromDetail(DETAIL);
const update = (over: Partial<FeatureFormValues>) =>
  buildUpdateOperation("F-001", baseline, { ...baseline, ...over });

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: un cas par comportement de la création
describe("buildCreateOperation", () => {
  it("titre et priorité seulement : statut brouillon, description et listes vides ne sont pas envoyés", () => {
    expect(buildCreateOperation(base())).toStrictEqual({
      kind: "feature.create",
      title: "Nouvelle",
      priority: "should",
    });
  });

  it("le titre est envoyé sans espaces autour", () => {
    expect(buildCreateOperation(base({ title: "  Nouvelle \n" }))).toMatchObject({
      title: "Nouvelle",
    });
  });

  it("statut différent de brouillon : envoyé", () => {
    expect(buildCreateOperation(base({ status: "specifiee" }))).toMatchObject({
      status: "specifiee",
    });
  });

  it("description : retours à la ligne conservés (CRLF devient LF), vide ou blanche non envoyée", () => {
    expect(buildCreateOperation(base({ description: "a\r\n\r\nb" }))).toMatchObject({
      description: "a\n\nb",
    });
    expect(buildCreateOperation(base({ description: "  \n " }))).not.toHaveProperty("description");
  });

  it("listes de liens : tableaux d'identifiants sans lignes vides, seulement si non vides", () => {
    const op = buildCreateOperation(
      base({ screens: " S-login \r\n\nS-home\n", roles: "RL-owner", rules: "", tables: "  " }),
    );
    expect(op).toMatchObject({ screens: ["S-login", "S-home"], roles: ["RL-owner"] });
    for (const absent of ["rules", "tables", "endpoints", "nfr"]) {
      expect(op).not.toHaveProperty(absent);
    }
  });

  it("critères : titre et étapes {type, text} sans identifiant AC-n, toute la liste", () => {
    const criteria = [
      {
        id: "AC-1",
        title: " Connexion ",
        steps: [
          { type: "etant_donne" as const, text: " un compte " },
          { type: "alors" as const, text: "ok" },
        ],
      },
      { title: "Sans étape", steps: [] },
    ];
    expect(buildCreateOperation(base({ criteria }))).toMatchObject({
      criteria: [
        {
          title: "Connexion",
          steps: [
            { type: "etant_donne", text: "un compte" },
            { type: "alors", text: "ok" },
          ],
        },
        { title: "Sans étape", steps: [] },
      ],
    });
  });

  it("n'invente jamais F-nnn, chemin de fichier, message ni clé", () => {
    const op = buildCreateOperation(base({ description: "x", screens: "S-a" }));
    for (const forbidden of ["specId", "filePath", "message", "idempotencyKey", "baseSha"]) {
      expect(op).not.toHaveProperty(forbidden);
    }
  });

  it("la sortie est une opération valide du contrat", () => {
    const op = buildCreateOperation(
      base({
        status: "adoptee",
        description: "d",
        nfr: "NFR-a",
        criteria: [{ title: "t", steps: [] }],
      }),
    );
    expect(specOperationSchema.safeParse(op).success).toBe(true);
  });
});

describe("buildUpdateOperation (patch minimal)", () => {
  it("rien n'a changé : null (le contrat exige au moins un champ modifié)", () => {
    expect(update({})).toBeNull();
  });

  it("seul le titre modifié : { kind, specId, title } et rien d'autre", () => {
    expect(update({ title: "Autre titre" })).toStrictEqual({
      kind: "feature.update",
      specId: "F-001",
      title: "Autre titre",
    });
  });

  it("espaces autour du titre : pas une modification", () => {
    expect(update({ title: `  ${baseline.title} ` })).toBeNull();
  });

  it("statut remis à brouillon : envoyé (c'est une modification, pas la valeur par défaut)", () => {
    const from = { ...baseline, status: "adoptee" as const };
    expect(buildUpdateOperation("F-001", from, { ...from, status: "brouillon" })).toStrictEqual({
      kind: "feature.update",
      specId: "F-001",
      status: "brouillon",
    });
  });

  it("description vidée : envoyée comme chaîne vide", () => {
    expect(update({ description: "" })).toMatchObject({ description: "" });
  });

  it("liste de liens vidée : tableau vide envoyé ; liste modifiée : nouvelle liste", () => {
    expect(update({ screens: "" })).toStrictEqual({
      kind: "feature.update",
      specId: "F-001",
      screens: [],
    });
    expect(update({ tables: "T-user\nT-order" })).toMatchObject({ tables: ["T-user", "T-order"] });
  });

  it("critères : toute la liste dès qu'un critère, une étape ou l'ordre change", () => {
    const [first, second] = baseline.criteria;
    if (!first || !second) throw new Error("fixture");
    const op = update({ criteria: [second, first] });
    expect(op).toMatchObject({
      criteria: [
        { title: "Adresse inconnue", steps: [] },
        { title: "Connexion réussie", steps: first.steps },
      ],
    });
    expect(Object.keys(op ?? {}).sort()).toEqual(["criteria", "kind", "specId"]);
  });

  it("plusieurs champs : exactement ceux-là", () => {
    const op = update({ title: "T", priority: "wont", nfr: "NFR-x" });
    expect(Object.keys(op ?? {}).sort()).toEqual(["kind", "nfr", "priority", "specId", "title"]);
  });

  it("la sortie est une opération valide du contrat", () => {
    expect(specOperationSchema.safeParse(update({ title: "T" })).success).toBe(true);
  });
});

describe("buildSubmitInput", () => {
  const context = { projectId: PROJECT_ID, idempotencyKey: KEY, branch: "main" };

  it("création : pas de baseSha (une création n'échoue pas parce qu'une autre fonctionnalité a changé)", () => {
    const input = buildSubmitInput(context, buildCreateOperation(base()));
    expect(input).toStrictEqual({
      projectId: PROJECT_ID,
      idempotencyKey: KEY,
      branch: "main",
      operations: [{ kind: "feature.create", title: "Nouvelle", priority: "should" }],
    });
    expect(input).not.toHaveProperty("baseSha");
  });

  it("modification : baseSha = version lue à l'ouverture, une seule opération", () => {
    const op = update({ title: "T" });
    if (!op) throw new Error("fixture");
    const input = buildSubmitInput({ ...context, baseSha: SHA }, op);
    expect(input.baseSha).toBe(SHA);
    expect(input.operations).toHaveLength(1);
  });

  it("message jamais envoyé ; branche = branche lue", () => {
    const input = buildSubmitInput({ ...context, branch: "cadrage" }, buildCreateOperation(base()));
    expect(input).not.toHaveProperty("message");
    expect(input.branch).toBe("cadrage");
  });

  it("la sortie passe le schéma d'entrée du contrat (clé d'idempotence comprise)", () => {
    const create = buildSubmitInput(context, buildCreateOperation(base()));
    expect(specBatchSubmitInputSchema.safeParse(create).success).toBe(true);
    const op = update({ priority: "wont" });
    if (!op) throw new Error("fixture");
    expect(
      specBatchSubmitInputSchema.safeParse(buildSubmitInput({ ...context, baseSha: SHA }, op))
        .success,
    ).toBe(true);
  });
});

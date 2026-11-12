import { contract } from "@koklo/contract";
import * as domain from "@koklo/domain";
import * as schema from "@koklo/schema";
import { emitFeatureMarkdown, parseFeatureMarkdown } from "@koklo/schema";
import { describe, expect, it } from "vitest";
import { CRITERION, modelFeature } from "./helpers/ai-bench.ts";

/**
 * TK-54b : parité du contrat 0.9.0 avec `@koklo/schema` (le contrat ne peut pas l'importer). Une
 * proposition validée par le contrat doit produire une feature valide du dépôt de spec, et la règle
 * d'ordre des étapes est la règle 5 de `@koklo/schema` (exportée, pas dupliquée).
 */
type Standard = { "~standard": { validate(v: unknown): unknown } };
const schemaOf = (path: string, kind: "inputSchemas" | "outputSchemas") => {
  const [group, name] = path.split(".") as [string, string];
  const node = (
    contract as unknown as Record<
      string,
      Record<string, { "~orpc": Record<string, Standard[] | undefined> }>
    >
  )[group]?.[name];
  return node?.["~orpc"][kind]?.[0];
};
const validate = async (schemaLike: Standard | undefined, value: unknown) =>
  (await schemaLike?.["~standard"].validate(value)) as
    | { issues?: unknown[]; value?: unknown }
    | undefined;

const META = { provider: "anthropic", model: "m", usage: { inputTokens: 1, outputTokens: 1 } };

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("une proposition du contrat devient une feature valide du dépôt de spec", () => {
  it("emitFeatureMarkdown puis parseFeatureMarkdown : aucune issue, mêmes critères", async () => {
    const output = await validate(schemaOf("ai.proposeFeatures", "outputSchemas"), {
      features: [{ kind: "feature.create", ...modelFeature() }],
      duplicates: [],
      meta: META,
    });
    expect(output?.issues).toBeUndefined();
    type Proposed = {
      title: string;
      priority: string;
      description: string;
      criteria: { title: string; steps: { type: string; text: string }[] }[];
    };
    const value = (output?.value ?? { features: [] }) as { features: Proposed[] };
    const proposed = value.features[0];
    expect(proposed).toBeDefined();
    if (!proposed) return;

    const feature = {
      id: "F-001",
      titre: proposed.title,
      statut: "brouillon",
      priorite: proposed.priority,
      tables: [],
      endpoints: [],
      ecrans: [],
      roles: [],
      regles: [],
      nfr: [],
      description: proposed.description,
      criteres: proposed.criteria.map((criterion, index) => ({
        id: `AC-${index + 1}`,
        titre: criterion.title,
        etapes: criterion.steps.map((step) => ({ type: step.type, texte: step.text })),
      })),
    };
    const markdown = emitFeatureMarkdown(feature as Parameters<typeof emitFeatureMarkdown>[0]);
    const parsed = parseFeatureMarkdown("features/F-001-liste-des-tickets.md", markdown);

    expect(JSON.stringify(parsed)).toContain("Liste des tickets");
    expect(JSON.stringify(parsed)).toContain(CRITERION.title);
  });

  it("les types d'étape du contrat sont ceux du schéma de spec", async () => {
    const accepted = [];
    for (const type of ["etant_donne", "quand", "alors", "et"]) {
      const verdict = await validate(schemaOf("ai.proposeCriteria", "outputSchemas"), {
        operation: {
          kind: "feature.update",
          specId: "F-001",
          criteria: [
            {
              title: "t",
              steps: [
                { type, text: "x" },
                { type: "quand", text: "y" },
                { type: "alors", text: "z" },
              ],
            },
          ],
        },
        meta: META,
      });
      accepted.push(verdict !== undefined && verdict.issues === undefined);
    }
    expect(accepted).toEqual([true, true, true, true]);
  });
});

describe("la règle d'ordre des étapes est celle de @koklo/schema", () => {
  it("checkCriteriaSteps est exporté par l'index du paquet (ajout additif)", () => {
    expect(typeof (schema as Record<string, unknown>).checkCriteriaSteps).toBe("function");
  });

  it("elle signale un critère mal ordonné d'une feature spécifiée, et pas un critère complet", () => {
    const check = (schema as Record<string, unknown>).checkCriteriaSteps as
      | ((path: string, feature: unknown) => { code: string }[])
      | undefined;
    const feature = (etapes: { type: string; texte: string }[]) => ({
      id: "F-001",
      titre: "t",
      statut: "specifiee",
      priorite: "must",
      tables: [],
      endpoints: [],
      ecrans: [],
      roles: [],
      regles: [],
      nfr: [],
      description: "",
      criteres: [{ id: "AC-1", titre: "c", etapes }],
    });
    expect(
      check?.(
        "f.md",
        feature([
          { type: "etant_donne", texte: "a" },
          { type: "quand", texte: "b" },
          { type: "alors", texte: "c" },
        ]),
      ),
    ).toEqual([]);
    expect(
      check?.(
        "f.md",
        feature([
          { type: "alors", texte: "c" },
          { type: "quand", texte: "b" },
          { type: "etant_donne", texte: "a" },
        ]),
      )?.[0]?.code,
    ).toBe("R5_CRITERION_INCOMPLETE");
  });
});

/**
 * TK-99a : parité du contrat 2.9.0 (`proposal.*`, `ai.propose*`) avec `@koklo/domain` et `@koklo/schema`. Le contrat
 * ne les importe pas : les vocabulaires (types, statuts, modes, livrables) sont recopiés, ce test les garde égaux.
 */
describe("les propositions de l'agent : vocabulaires du contrat égaux à ceux du domaine et du schéma", () => {
  const enumOf = async (path: string, kind: "inputSchemas" | "outputSchemas", field: string) => {
    const validate_ = schemaOf(path, kind);
    const accepted: string[] = [];
    const candidates = [
      ...domain.AGENT_PROPOSAL_KINDS,
      ...domain.AGENT_PROPOSAL_STATUSES,
      ...domain.FUNCTIONAL_MODES,
      ...domain.DELIVERABLES,
      "inconnu",
    ];
    for (const value of new Set(candidates)) {
      const probe = await validate(validate_, { [field]: value });
      // Une valeur du vocabulaire n'est jamais l'objet d'une issue sur ce champ.
      const issues = (probe?.issues ?? []) as { path?: (string | { key?: string })[] }[];
      const refused = issues.some((issue) =>
        (issue.path ?? []).some((part) => (typeof part === "string" ? part : part.key) === field),
      );
      if (!refused) accepted.push(value);
    }
    return accepted.sort();
  };

  it("types de proposition : ceux du domaine et un schéma de contenu par type", async () => {
    expect(Object.keys(schema.PROPOSAL_SCHEMAS)).toEqual([...domain.AGENT_PROPOSAL_KINDS]);
  });

  it("modes du lancement : ceux du domaine", async () => {
    expect(await enumOf("ai.proposeDeliverable", "inputSchemas", "mode")).toEqual(
      [...domain.FUNCTIONAL_MODES].sort(),
    );
  });

  it("livrables : les sept du domaine", async () => {
    expect(await enumOf("ai.proposeDeliverable", "inputSchemas", "deliverable")).toEqual(
      [...domain.DELIVERABLES].sort(),
    );
  });

  it("une charge produite par le schéma d'un type est acceptée par le contrat de décision (contenu corrigé)", async () => {
    const content = schema.featureProposalSchema.parse(modelFeature());
    const verdict = await validate(schemaOf("proposal.decide", "inputSchemas"), {
      projectId: "123e4567-e89b-42d3-a456-426614174000",
      proposalId: "123e4567-e89b-42d3-a456-426614174001",
      decision: "accept",
      edited: content,
    });
    expect(verdict?.issues).toBeUndefined();
  });

  it("une proposition de type feature devient un fichier de spec valide (même chemin que ai.proposeFeatures)", () => {
    const content = schema.featureProposalSchema.parse(modelFeature());
    expect(content.criteria[0]?.title).toBe(CRITERION.title);
  });
});

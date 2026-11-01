import type { AgentRole, Enforcement, Rule } from "./catalog-types.ts";

const AGENTS: readonly AgentRole[] = ["developer", "qa-reviewer", "tech-lead"];
const PROFILES = ["koklo-strict"] as const;

type Spec = readonly [
  id: string,
  title: string,
  description: string,
  enforcement: Enforcement,
  options?: { readonly locked?: true; readonly advisory?: true },
];

const SPECS: readonly Spec[] = [
  [
    "strict.adr-per-decision",
    "Un ADR par décision d'architecture",
    "Toute décision structurante est consignée dans un ADR avant d'être livrée (vision §17.1).",
    { kind: "evidence", evidence: "Lien vers l'ADR docs/adr/NNNN-titre.md de la décision" },
  ],
  [
    "strict.cognitive-complexity",
    "Complexité cognitive limitée à 15",
    "Une fonction ne dépasse pas 15 de complexité cognitive (vision §17.2).",
    {
      kind: "gate",
      adapter: "biome",
      params: { rule: "complexity/noExcessiveCognitiveComplexity", max: 15 },
    },
    { locked: true },
  ],
  [
    "strict.conventional-commits",
    "Commits conventionnels",
    "Chaque message de commit suit Conventional Commits (vision §17.3).",
    { kind: "gate", adapter: "commitlint" },
    { locked: true },
  ],
  [
    "strict.domain-purity",
    "Domaine pur",
    "packages/domain ne dépend d'aucun framework ni d'aucune infrastructure (vision §17.1).",
    { kind: "gate", adapter: "turbo-boundaries" },
    { locked: true },
  ],
  [
    "strict.english-code-french-ui",
    "Code en anglais, interface en français",
    "Identifiants et commentaires de code en anglais, textes visibles par l'utilisateur en français.",
    { kind: "instruction" },
    { advisory: true },
  ],
  [
    "strict.file-size-source",
    "Fichier source limité à 300 lignes",
    "Un fichier source ne dépasse pas 300 lignes (vision §17.2).",
    { kind: "gate", adapter: "check-size", params: { max: 300, scope: "source" } },
    { locked: true },
  ],
  [
    "strict.file-size-test",
    "Fichier de test limité à 500 lignes",
    "Un fichier de test ne dépasse pas 500 lignes (vision §17.2).",
    { kind: "gate", adapter: "check-size", params: { max: 500, scope: "test" } },
    { locked: true },
  ],
  [
    "strict.fn-lines",
    "Fonction limitée à 50 lignes",
    "Une fonction ne dépasse pas 50 lignes (vision §17.2).",
    {
      kind: "gate",
      adapter: "biome",
      params: { rule: "complexity/noExcessiveLinesPerFunction", max: 50 },
    },
    { locked: true },
  ],
  [
    "strict.max-params",
    "Fonction limitée à 4 paramètres",
    "Une fonction prend au plus 4 paramètres ; au-delà, un objet nommé (vision §17.2).",
    { kind: "instruction", params: { max: 4 } },
    { locked: true },
  ],
  [
    "strict.naming-kebab-case",
    "Fichiers en kebab-case",
    "Les noms de fichiers et de dossiers sont en kebab-case (vision §17.3).",
    { kind: "instruction" },
  ],
  [
    "strict.no-dead-code-or-orphan-todo",
    "Ni code mort ni TODO orphelin",
    "Pas de code mort ; tout TODO référence un ticket, au format TODO(TK-n) (vision §17.3).",
    { kind: "gate", adapter: "check-todo", params: { pattern: "TODO\\(TK-[0-9]+\\)" } },
  ],
  [
    "strict.no-explicit-any",
    "Pas de any explicite",
    "Le type any est interdit : unknown puis un rétrécissement (vision §17.2).",
    {
      kind: "gate",
      adapter: "biome",
      params: { rule: "suspicious/noExplicitAny", level: "error" },
    },
    { locked: true },
  ],
  [
    "strict.structured-logs",
    "Journaux structurés",
    "Les journaux sont des objets structurés, sans donnée personnelle ni secret (vision §17.3).",
    { kind: "instruction" },
  ],
  [
    "strict.thin-controllers",
    "Contrôleurs minces",
    "Un contrôleur valide, délègue au cas d'usage et traduit la réponse : aucune logique métier.",
    { kind: "instruction" },
  ],
  [
    "strict.typed-errors",
    "Erreurs typées",
    "Les erreurs attendues sont des types explicites, pas des exceptions génériques (vision §17.3).",
    { kind: "instruction" },
  ],
  [
    "strict.waiver-traced",
    "Dérogation tracée",
    "Toute dérogation est inscrite dans .koklo/waivers.yaml avec justification et expiration.",
    {
      kind: "evidence",
      evidence: "Entrée .koklo/waivers.yaml : fichier, règle, justification, auteur, expiration",
    },
  ],
];

const toRule = ([id, title, description, enforcement, options]: Spec): Rule => ({
  id,
  title,
  description,
  profiles: PROFILES,
  agents: AGENTS,
  severity: options?.advisory === true ? "advisory" : "blocking",
  protected: options?.locked === true,
  enforcement,
});

/** Règles `strict.*` dans l'ordre des ids (SPECS est déjà trié). */
export const STRICT_RULES: readonly Rule[] = SPECS.map(toRule);

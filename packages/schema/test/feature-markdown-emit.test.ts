import { describe, expect, it } from "vitest";
import {
  checkSpec,
  EmitFeatureError,
  emitFeatureMarkdown,
  type Feature,
  parseFeatureMarkdown,
} from "../src/index.ts";
import { deepFreeze, validFile, withFiles } from "./helpers.ts";

/**
 * TK-44a : émetteur Markdown canonique d'une feature (TK-40 Q1, « hors ticket » jusqu'ici).
 * Contrat : `emitFeatureMarkdown(feature: Feature): string`, fonction pure ; lève
 * `EmitFeatureError` (propriété `path` : pointeur JSON de la valeur refusée, comme
 * `CanonicalizeError`) quand la feature est invalide ou ne peut pas être sérialisée sans
 * ambiguïté. Format : celui de l'annexe A §4.2 (fixture F-001 reproduite à l'octet près).
 */
const PATH = "features/F-001-inscription.md";
const fixture = validFile(PATH);

function parsed(path: string, content: string): Feature {
  const result = parseFeatureMarkdown(path, content);
  if (!result.ok) throw new Error(`parse en échec : ${JSON.stringify(result.issues)}`);
  return result.value;
}

const base = (overrides: Partial<Feature> = {}): Feature => ({
  id: "F-010",
  titre: "Exemple",
  statut: "brouillon",
  priorite: "should",
  tables: [],
  endpoints: [],
  ecrans: [],
  roles: [],
  regles: [],
  nfr: [],
  description: "",
  criteres: [],
  ...overrides,
});

const criterion = (id: string, titre: string, texte = "x") => ({
  id,
  titre,
  etapes: [{ type: "quand" as const, texte }],
});

function failure(feature: Feature): EmitFeatureError {
  try {
    emitFeatureMarkdown(feature);
  } catch (error) {
    expect(error).toBeInstanceOf(EmitFeatureError);
    return error as EmitFeatureError;
  }
  throw new Error("l'émission aurait dû être refusée");
}

describe("TK-44a format canonique", () => {
  it("réémet la fixture F-001 de l'annexe A à l'octet près", () => {
    expect(emitFeatureMarkdown(parsed(PATH, fixture))).toBe(fixture);
  });

  it("feature minimale : listes vides en ligne, sections présentes, un seul \\n final", () => {
    expect(emitFeatureMarkdown(base())).toBe(
      [
        "---",
        "id: F-010",
        "titre: Exemple",
        "statut: brouillon",
        "priorite: should",
        "tables: []",
        "endpoints: []",
        "ecrans: []",
        "roles: []",
        "regles: []",
        "nfr: []",
        "---",
        "",
        "## Description",
        "",
        "## Critères d'acceptation",
        "",
      ].join("\n"),
    );
  });

  it("clés du front matter dans l'ordre fixe id, titre, statut, priorite, tables, endpoints, ecrans, roles, regles, nfr", () => {
    const text = emitFeatureMarkdown(base({ tables: ["T-b", "T-a"] }));
    const keys = text
      .split("\n")
      .slice(1, text.split("\n").indexOf("---", 1))
      .map((line) => line.split(":")[0]);
    expect(keys).toEqual([
      "id",
      "titre",
      "statut",
      "priorite",
      "tables",
      "endpoints",
      "ecrans",
      "roles",
      "regles",
      "nfr",
    ]);
  });

  it("ne trie pas les listes de liens ni les critères : l'ordre soumis est conservé", () => {
    const feature = base({
      tables: ["T-b", "T-a"],
      criteres: [criterion("AC-3", "Troisième"), criterion("AC-1", "Premier")],
    });
    const text = emitFeatureMarkdown(feature);
    expect(text).toContain("tables: [T-b, T-a]");
    expect(text.indexOf("### AC-3")).toBeLessThan(text.indexOf("### AC-1"));
  });

  it("l'ordre des propriétés de l'objet d'entrée ne change pas la sortie", () => {
    const feature = parsed(PATH, fixture);
    const shuffled = Object.fromEntries(Object.entries(feature).reverse()) as Feature;
    expect(emitFeatureMarkdown(shuffled)).toBe(emitFeatureMarkdown(feature));
  });

  it("fin de fichier : un unique \\n, ni \\r, ni BOM, ni espace en fin de ligne", () => {
    const text = emitFeatureMarkdown(parsed(PATH, fixture));
    expect(text.endsWith("\n")).toBe(true);
    expect(text.endsWith("\n\n")).toBe(false);
    expect(text).not.toContain("\r");
    expect(text.charCodeAt(0)).not.toBe(0xfeff);
    expect(text).not.toMatch(/[ \t]+$/m);
  });

  it("conserve les identifiants AC-n, y compris avec des trous, et les 4 types d'étapes", () => {
    const feature = base({
      criteres: [
        {
          id: "AC-2",
          titre: "Avec trous",
          etapes: [
            { type: "etant_donne", texte: "un contexte" },
            { type: "quand", texte: "une action" },
            { type: "alors", texte: "un résultat" },
            { type: "et", texte: "un autre résultat" },
          ],
        },
        criterion("AC-7", "Sauté"),
      ],
    });
    const text = emitFeatureMarkdown(feature);
    expect(text).toContain("### AC-2 — Avec trous");
    expect(text).toContain("### AC-7 — Sauté");
    expect(text).toContain(
      "- **Étant donné** un contexte\n- **Quand** une action\n- **Alors** un résultat\n- **Et** un autre résultat\n",
    );
  });

  it("ne modifie pas l'entrée (gelée) et rend la même chaîne à chaque appel", () => {
    const feature = deepFreeze(parsed(PATH, fixture));
    const snapshot = JSON.stringify(feature);
    expect(emitFeatureMarkdown(feature)).toBe(emitFeatureMarkdown(feature));
    expect(JSON.stringify(feature)).toBe(snapshot);
  });
});

const SAMPLES: Record<string, Feature> = {
  "fixture F-001": parsed(PATH, fixture),
  minimale: base(),
  "description multi-paragraphes avec liste et sous-titre": base({
    description: "Premier paragraphe.\n\n### Sous-titre\n- puce un\n- puce deux\n\nDernier : fin.",
  }),
  "critère sans étape": base({ criteres: [{ id: "AC-1", titre: "Sans étape", etapes: [] }] }),
  "tous les liens": base({
    statut: "specifiee",
    tables: ["T-user", "T-order-line"],
    endpoints: ["E-auth-register"],
    ecrans: ["S-register"],
    roles: ["RL-visiteur"],
    regles: ["R-003"],
    nfr: ["NFR-001"],
  }),
  "texte accentué et guillemets": base({
    titre: "Créer un compte « rapide » 🎉",
    criteres: [
      criterion(
        "AC-1",
        "Mot de passe d'au moins 12 caractères",
        "le bouton « Créer » reste inactif",
      ),
    ],
  }),
};

describe("TK-44a aller-retour parse -> emit -> parse", () => {
  for (const [name, feature] of Object.entries(SAMPLES)) {
    it(`${name} : parse(emit(f)) rend f`, () => {
      expect(parsed(PATH, emitFeatureMarkdown(feature))).toEqual(feature);
    });

    it(`${name} : emit(parse(emit(f))) == emit(f) octet pour octet (idempotent)`, () => {
      const once = emitFeatureMarkdown(feature);
      const twice = emitFeatureMarkdown(parsed(PATH, once));
      expect(twice).toBe(once);
    });
  }

  it("la fixture parse -> emit -> parse est identique à la fixture parsée", () => {
    const first = parsed(PATH, fixture);
    expect(parsed(PATH, emitFeatureMarkdown(first))).toEqual(first);
  });

  it("une feature émise s'insère dans la spec valide sans nouvelle erreur de validation", () => {
    const feature = parsed(PATH, fixture);
    const extended: Feature = {
      ...feature,
      statut: "specifiee",
      // TK-53a : dès `specifiee`, un critère doit avoir Étant donné, Quand, Alors (R5_CRITERION_INCOMPLETE).
      criteres: [
        ...feature.criteres,
        {
          id: "AC-4",
          titre: "Nouveau critère",
          etapes: [
            { type: "etant_donne" as const, texte: "x" },
            { type: "quand" as const, texte: "x" },
            { type: "alors" as const, texte: "x" },
          ],
        },
      ],
    };
    const report = checkSpec(withFiles({ [PATH]: emitFeatureMarkdown(extended) }));
    expect(report.counts.error).toBe(0);
    expect(report.issues.filter((i) => i.severity === "error")).toEqual([]);
  });
});

describe("TK-44a texte libre : aucun échappement dangereux", () => {
  const TITLES = [
    "Connexion: avec deux-points",
    "Titre # pas un commentaire",
    "\"entre guillemets\" et 'apostrophes'",
    "- commence par un tiret",
    "---",
    "&ancre",
    "*alias",
    "!!str étiquette",
    "|bloc",
    ">replié",
    "{a: b}",
    "[x, y]",
    "null",
    "true",
    "123",
    "~",
    "titre avec \\ antislash",
    "@réservé",
    "`backtick`",
    "%directive",
    " espaces autour ",
  ];

  for (const titre of TITLES) {
    it(`titre ${JSON.stringify(titre)} : round-trip exact, aucune clé ajoutée au front matter`, () => {
      const feature = base({ titre });
      const text = emitFeatureMarkdown(feature);
      expect(parsed(PATH, text)).toEqual(feature);
      expect(emitFeatureMarkdown(parsed(PATH, text))).toBe(text);
      const frontMatter = text.split("\n").slice(1, text.split("\n").indexOf("---", 1));
      expect(frontMatter).toHaveLength(10);
    });
  }

  it("titre sur plusieurs lignes (injection de front matter) : EmitFeatureError sur /titre", () => {
    const error = failure(base({ titre: "Gentil\n---\nstatut: adoptee\npriorite: must" }));
    expect(error.path).toBe("/titre");
    expect(error.message).toContain("/titre");
  });

  it("titre avec retour chariot ou caractère NUL : refusé", () => {
    expect(failure(base({ titre: "a\rb" })).path).toBe("/titre");
    expect(failure(base({ titre: "a\u0000b" })).path).toBe("/titre");
  });

  it("titre de critère sur plusieurs lignes : refusé sur /criteres/1/titre", () => {
    const error = failure(
      base({ criteres: [criterion("AC-1", "ok"), criterion("AC-2", "a\n## Description")] }),
    );
    expect(error.path).toBe("/criteres/1/titre");
  });

  it("texte d'étape sur plusieurs lignes : refusé sur /criteres/0/etapes/1/texte", () => {
    const error = failure(
      base({
        criteres: [
          {
            id: "AC-1",
            titre: "t",
            etapes: [
              { type: "quand", texte: "ok" },
              { type: "alors", texte: "a\n### AC-9 — injecté" },
            ],
          },
        ],
      }),
    );
    expect(error.path).toBe("/criteres/0/etapes/1/texte");
  });

  it("titre de critère et étapes qui ressemblent à du Markdown structurel restent du texte", () => {
    const feature = base({
      criteres: [
        {
          id: "AC-1",
          titre: "## Pirate — et un tiret long",
          etapes: [
            { type: "alors", texte: "## Critères d'acceptation" },
            { type: "et", texte: "**Quand** imbriqué" },
            { type: "et", texte: "---" },
          ],
        },
      ],
    });
    const result = parsed(PATH, emitFeatureMarkdown(feature));
    expect(result).toEqual(feature);
  });

  it.each([
    ["un titre de section", "avant\n## Critères d'acceptation\n### AC-9 — fantôme"],
    ["une autre section de niveau 2", "avant\n## Autre section\naprès"],
    ["une ligne ---", "avant\n---\nstatut: adoptee"],
  ])("description contenant %s : refusée sur /description", (_label, description) => {
    expect(failure(base({ description })).path).toBe("/description");
  });

  it("description refusée : aucun fichier partiel (l'exception est levée, rien n'est retourné)", () => {
    expect(() => emitFeatureMarkdown(base({ description: "x\n## Y" }))).toThrow(EmitFeatureError);
  });
});

describe("TK-44a erreurs typées", () => {
  it("EmitFeatureError est une Error nommée, avec un pointeur JSON", () => {
    const error = failure(base({ id: "X-1" }));
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("EmitFeatureError");
    expect(error.path).toBe("/id");
  });

  it.each([
    ["identifiant de feature invalide", base({ id: "F-1" }), "/id"],
    ["statut hors énumération", base({ statut: "fini" as Feature["statut"] }), "/statut"],
    ["priorité hors énumération", base({ priorite: "urgent" as Feature["priorite"] }), "/priorite"],
    ["titre vide", base({ titre: "" }), "/titre"],
    ["lien de table invalide", base({ tables: ["user"] }), "/tables/0"],
    [
      "identifiant de critère invalide",
      base({ criteres: [criterion("AC-x", "t")] }),
      "/criteres/0/id",
    ],
    [
      "identifiants de critères dupliqués",
      base({ criteres: [criterion("AC-1", "a"), criterion("AC-1", "b")] }),
      "/criteres/1/id",
    ],
    ["titre de critère vide", base({ criteres: [criterion("AC-1", "")] }), "/criteres/0/titre"],
    [
      "texte d'étape vide",
      base({ criteres: [{ id: "AC-1", titre: "t", etapes: [{ type: "quand", texte: "" }] }] }),
      "/criteres/0/etapes/0/texte",
    ],
  ])("%s : EmitFeatureError sur %s", (_label, feature, path) => {
    expect(failure(feature).path).toBe(path);
  });

  it("une valeur qui n'est pas un objet est refusée à la racine", () => {
    expect(() => emitFeatureMarkdown(null as unknown as Feature)).toThrow(EmitFeatureError);
  });
});

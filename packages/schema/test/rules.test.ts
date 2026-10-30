import { describe, expect, it } from "vitest";
import type { Issue } from "../src/index.ts";
import { checkSpec, parseSpecFiles, validateSpec } from "../src/index.ts";
import { codes, deepFreeze, patch, validFile, validFiles, withFiles } from "./helpers.ts";

const FEATURE = "features/F-001-inscription.md";
const SCREEN = "design/screens/S-register.json";
const ANNOT = "/arbre/enfants/0/annotations/0";

const feature2 = (statut: string, extra = "") =>
  `---\nid: F-002\ntitre: Connexion\nstatut: ${statut}\npriorite: should\n${extra}---\n\n## Description\nSe connecter.\n\n## Critères d'acceptation\n`;
const F2 = "features/F-002-connexion.md";

describe("fixture valide complète (annexe A)", () => {
  it("ne produit aucune issue : rapport ok, 0 erreur, 0 avertissement", () => {
    expect(checkSpec(validFiles())).toEqual({
      ok: true,
      counts: { error: 0, warning: 0 },
      issues: [],
    });
  });

  it("validateSpec(parseSpecFiles(f).spec) équivaut à checkSpec(f) et accepte une entrée gelée", () => {
    const { spec } = parseSpecFiles(validFiles());
    expect(validateSpec(deepFreeze(spec))).toEqual(checkSpec(validFiles()));
  });
});

type Fixture = {
  code: string;
  changes: Record<string, string | null>;
  expected: Pick<Issue, "path" | "pointer" | "entityId">;
  severity?: Issue["severity"];
};

const sharedTables = (extra: string) =>
  validFile("api/endpoints/E-auth-register.yaml").replace("tables: [T-user]", `tables: [${extra}]`);

const invalid: Fixture[] = [
  {
    code: "R4_UNKNOWN_FEATURE",
    changes: {
      [SCREEN]: patch(SCREEN, '"feature": "F-001", "critere"', '"feature": "F-999", "critere"'),
    },
    expected: { path: SCREEN, pointer: `${ANNOT}/feature`, entityId: "S-register" },
  },
  {
    code: "R4_UNKNOWN_CRITERION",
    changes: { [SCREEN]: patch(SCREEN, '"critere": "AC-1"', '"critere": "AC-9"') },
    expected: { path: SCREEN, pointer: `${ANNOT}/critere`, entityId: "S-register" },
  },
  {
    code: "R4_UNKNOWN_TABLE",
    changes: { [SCREEN]: patch(SCREEN, "T-user.email", "T-ghost.email") },
    expected: { path: SCREEN, pointer: `${ANNOT}/donnee`, entityId: "S-register" },
  },
  {
    code: "R4_UNKNOWN_FIELD",
    changes: { [SCREEN]: patch(SCREEN, "T-user.email", "T-user.inexistant") },
    expected: { path: SCREEN, pointer: `${ANNOT}/donnee`, entityId: "S-register" },
  },
  {
    code: "R4_UNKNOWN_ENDPOINT",
    changes: { [SCREEN]: patch(SCREEN, '"endpoint": "E-auth-register"', '"endpoint": "E-ghost"') },
    expected: {
      path: SCREEN,
      pointer: "/arbre/enfants/1/annotations/0/endpoint",
      entityId: "S-register",
    },
  },
  {
    code: "R4_UNKNOWN_SCREEN",
    changes: {
      [FEATURE]: patch(
        FEATURE,
        "ecrans: [S-register, S-register-success]",
        "ecrans: [S-register, S-register-success, S-ghost]",
      ),
    },
    expected: { path: FEATURE, pointer: "/ecrans/2", entityId: "F-001" },
  },
  {
    code: "R4_MALFORMED_DATA_REF",
    changes: { [SCREEN]: patch(SCREEN, "T-user.email", "user.email") },
    expected: { path: SCREEN, pointer: `${ANNOT}/donnee`, entityId: "S-register" },
  },
  {
    code: "R5_SPECIFIED_WITHOUT_SCREEN_OR_ENDPOINT",
    changes: { [F2]: feature2("specifiee") },
    expected: { path: F2, pointer: "", entityId: "F-002" },
  },
  {
    code: "R5_IMPLEMENTED_CRITERION_WITHOUT_TEST",
    changes: {
      "tests/scenarios/F-001-inscription.yaml": patch(
        "tests/scenarios/F-001-inscription.yaml",
        "[AC-1, AC-2, AC-3]",
        "[AC-1, AC-3]",
      ),
    },
    expected: { path: FEATURE, pointer: "/criteres/1", entityId: "F-001" },
  },
  {
    code: "R5_IMPLEMENTED_WITHOUT_CRITERIA",
    changes: { [F2]: feature2("implementee", "ecrans: [S-register]\n") },
    expected: { path: F2, pointer: "/criteres", entityId: "F-002" },
  },
  {
    code: "R7_ORPHAN_TABLE",
    changes: { "data/tables/T-audit.yaml": "id: T-audit\nchamps: []\n" },
    expected: { path: "data/tables/T-audit.yaml", pointer: "", entityId: "T-audit" },
    severity: "warning",
  },
  {
    code: "R7_ORPHAN_ENDPOINT",
    changes: { "api/endpoints/E-ghost.yaml": "id: E-ghost\nmethode: GET\nchemin: /ghost\n" },
    expected: { path: "api/endpoints/E-ghost.yaml", pointer: "", entityId: "E-ghost" },
    severity: "warning",
  },
  {
    code: "R7_ORPHAN_SCREEN",
    changes: {
      "design/screens/S-lonely.json":
        '{"id":"S-lonely","features":[],"arbre":{"composant":"C-page"},"etats":[]}',
    },
    expected: { path: "design/screens/S-lonely.json", pointer: "", entityId: "S-lonely" },
    severity: "warning",
  },
];

describe.each(invalid)("fixture invalide $code", ({ code, changes, expected, severity }) => {
  const report = checkSpec(withFiles(changes));
  const issue = report.issues.find((i) => i.code === code);

  it("signale le code attendu avec path, pointer et entityId exacts", () => {
    expect(issue, JSON.stringify(report.issues)).toBeDefined();
    expect(issue).toMatchObject(expected);
  });

  it("a la bonne règle et la bonne sévérité, et un message français non vide", () => {
    const rule = code.startsWith("R4") ? 4 : code.startsWith("R5") ? 5 : 7;
    expect(issue?.rule).toBe(rule);
    expect(issue?.severity).toBe(severity ?? "error");
    expect(issue?.message.length).toBeGreaterThan(15);
  });

  it("un seul défaut : aucune autre issue que celle-ci", () => {
    expect(codes(report.issues)).toEqual([code]);
  });

  it("ok est faux ssi une issue de sévérité error existe, counts exact", () => {
    const errors = severity === "warning" ? 0 : 1;
    expect(report.counts).toEqual({ error: errors, warning: 1 - errors });
    expect(report.ok).toBe(errors === 0);
  });
});

describe("CA4 règle 4 : cas complémentaires", () => {
  it("le message nomme la valeur fautive", () => {
    const report = checkSpec(
      withFiles({ [SCREEN]: patch(SCREEN, "T-user.email", "T-user.inexistant") }),
    );
    expect(report.issues[0]?.message).toContain("T-user.inexistant");
  });

  it("plusieurs liens morts : plusieurs issues", () => {
    const changes = {
      [SCREEN]: patch(SCREEN, "T-user.email", "T-ghost.email").replace(
        '"E-auth-register"',
        '"E-ghost"',
      ),
    };
    expect(codes(checkSpec(withFiles(changes)).issues)).toEqual([
      "R4_UNKNOWN_TABLE",
      "R4_UNKNOWN_ENDPOINT",
    ]);
  });

  it("critère non vérifié quand la feature de l'annotation est inconnue (pas de cascade)", () => {
    const changes = {
      [SCREEN]: patch(SCREEN, '"feature": "F-001", "critere"', '"feature": "F-999", "critere"'),
    };
    expect(codes(checkSpec(withFiles(changes)).issues)).toEqual(["R4_UNKNOWN_FEATURE"]);
  });

  it.each(["T-user.a.b", "T-user.", ".email", "T-", "t-user.email"])(
    "donnée mal formée %j",
    (donnee) => {
      const report = checkSpec(withFiles({ [SCREEN]: patch(SCREEN, "T-user.email", donnee) }));
      expect(codes(report.issues)).toEqual(["R4_MALFORMED_DATA_REF"]);
    },
  );

  it("une donnée T-user sans champ est bien formée et valide", () => {
    expect(
      checkSpec(withFiles({ [SCREEN]: patch(SCREEN, "T-user.email", "T-user") })).issues,
    ).toEqual([]);
  });

  it("endpoint : lien table inconnu", () => {
    const path = "api/endpoints/E-auth-register.yaml";
    const report = checkSpec(withFiles({ [path]: sharedTables("T-user, T-ghost") }));
    expect(report.issues).toMatchObject([
      { code: "R4_UNKNOWN_TABLE", path, pointer: "/tables/1", entityId: "E-auth-register" },
    ]);
  });

  it("écran : feature inconnue dans features[]", () => {
    const report = checkSpec(
      withFiles({
        [SCREEN]: patch(SCREEN, '"features": ["F-001"]', '"features": ["F-001", "F-999"]'),
      }),
    );
    expect(report.issues).toMatchObject([
      { code: "R4_UNKNOWN_FEATURE", path: SCREEN, pointer: "/features/1" },
    ]);
  });

  it("feature : table et endpoint inconnus", () => {
    const changes = {
      [FEATURE]: patch(FEATURE, "tables: [T-user]", "tables: [T-user, T-ghost]").replace(
        "endpoints: [E-auth-register]",
        "endpoints: [E-auth-register, E-ghost]",
      ),
    };
    expect(checkSpec(withFiles(changes)).issues).toMatchObject([
      { code: "R4_UNKNOWN_ENDPOINT", pointer: "/endpoints/1" },
      { code: "R4_UNKNOWN_TABLE", pointer: "/tables/1" },
    ]);
  });

  it("relation : table inconnue et champ inconnu", () => {
    const rel = "data/relations.yaml";
    const ghost = checkSpec(withFiles({ [rel]: patch(rel, "to: T-user.id", "to: T-ghost.id") }));
    expect(ghost.issues).toMatchObject([
      { code: "R4_UNKNOWN_TABLE", path: rel, pointer: "/relations/0/to" },
    ]);
    const field = checkSpec(
      withFiles({ [rel]: patch(rel, "from: T-session.user_id", "from: T-session.nope") }),
    );
    expect(field.issues).toMatchObject([
      { code: "R4_UNKNOWN_FIELD", path: rel, pointer: "/relations/0/from" },
    ]);
  });

  it("test : feature inconnue (avec orphelin R7) et critère inconnu", () => {
    const path = "tests/scenarios/F-001-inscription.yaml";
    const crit = checkSpec(
      withFiles({ [path]: patch(path, "[AC-1, AC-2, AC-3]", "[AC-1, AC-2, AC-3, AC-9]") }),
    );
    expect(crit.issues).toMatchObject([
      { code: "R4_UNKNOWN_CRITERION", path, pointer: "/criteres/3", entityId: "F-001" },
    ]);
    const ghostPath = "tests/scenarios/F-009-fantome.yaml";
    const ghost = checkSpec(
      withFiles({
        [ghostPath]: "feature: F-009\ntype: e2e\nfichier: e2e/x.spec.ts\ncriteres: [AC-1]\n",
      }),
    );
    expect(codes(ghost.issues).sort()).toEqual(["R4_UNKNOWN_FEATURE", "R7_ORPHAN_TEST"]);
    expect(ghost.issues.find((i) => i.code === "R7_ORPHAN_TEST")).toMatchObject({
      severity: "warning",
      path: ghostPath,
      entityId: "F-009",
    });
    expect(ghost.ok).toBe(false);
  });
});

describe("CA5 règle 5 : couverture", () => {
  const specifiee = (links: string) => ({ [F2]: feature2("specifiee", links) });

  it("specifiee couverte par un écran seul : aucune issue", () => {
    expect(checkSpec(withFiles(specifiee("ecrans: [S-register]\n"))).issues).toEqual([]);
  });

  it("specifiee couverte par un endpoint seul : aucune issue", () => {
    expect(checkSpec(withFiles(specifiee("endpoints: [E-auth-register]\n"))).issues).toEqual([]);
  });

  it("specifiee couverte par Screen.features seul : aucune issue", () => {
    const screen =
      '{"id":"S-login","features":["F-002"],"arbre":{"composant":"C-page"},"etats":[]}';
    const changes = { ...specifiee(""), "design/screens/S-login.json": screen };
    expect(checkSpec(withFiles(changes)).issues).toEqual([]);
  });

  it("specifiee avec uniquement un lien mort : R4 et R5 (le lien mort ne couvre pas)", () => {
    const report = checkSpec(withFiles(specifiee("ecrans: [S-ghost]\n")));
    expect(codes(report.issues).sort()).toEqual([
      "R4_UNKNOWN_SCREEN",
      "R5_SPECIFIED_WITHOUT_SCREEN_OR_ENDPOINT",
    ]);
  });

  it("implementee avec plusieurs critères non testés : une issue par critère, nommant AC-n", () => {
    const path = "tests/scenarios/F-001-inscription.yaml";
    const report = checkSpec(withFiles({ [path]: patch(path, "[AC-1, AC-2, AC-3]", "[AC-1]") }));
    expect(report.issues).toMatchObject([
      { code: "R5_IMPLEMENTED_CRITERION_WITHOUT_TEST", pointer: "/criteres/1" },
      { code: "R5_IMPLEMENTED_CRITERION_WITHOUT_TEST", pointer: "/criteres/2" },
    ]);
    expect(report.issues[0]?.message).toContain("AC-2");
    expect(report.issues[1]?.message).toContain("AC-3");
  });

  it("implementee sans aucun scénario de test : tous les critères signalés", () => {
    const report = checkSpec(withFiles({ "tests/scenarios/F-001-inscription.yaml": null }));
    expect(codes(report.issues)).toEqual(Array(3).fill("R5_IMPLEMENTED_CRITERION_WITHOUT_TEST"));
  });

  it("critères couverts par plusieurs scénarios cumulés : aucune issue", () => {
    const path = "tests/scenarios/F-001-inscription.yaml";
    const changes = {
      [path]: patch(path, "[AC-1, AC-2, AC-3]", "[AC-1]"),
      "tests/scenarios/F-001-extra.yaml":
        "feature: F-001\ntype: contrat\nfichier: c.ts\ncriteres: [AC-2, AC-3]\n",
    };
    expect(checkSpec(withFiles(changes)).issues).toEqual([]);
  });

  it.each(["brouillon", "adoptee"])("%s sans lien : aucune issue de règle 5", (statut) => {
    expect(checkSpec(withFiles({ [F2]: feature2(statut) })).issues).toEqual([]);
  });
});

describe("CA6 règle 7 : orphelins", () => {
  it("les avertissements n'invalident pas le rapport", () => {
    const report = checkSpec(
      withFiles({ "data/tables/T-audit.yaml": "id: T-audit\nchamps: []\n" }),
    );
    expect(report.ok).toBe(true);
    expect(report.counts).toEqual({ error: 0, warning: 1 });
  });

  it("une entité référencée une seule fois n'est pas orpheline (T-session par la relation seule)", () => {
    expect(checkSpec(validFiles()).issues.map((i) => i.entityId)).not.toContain("T-session");
  });

  it("une table n'est référencée que par une annotation donnee : pas orpheline", () => {
    const changes = {
      [FEATURE]: patch(FEATURE, "tables: [T-user]", "tables: []"),
      "api/endpoints/E-auth-register.yaml": sharedTables(""),
      "data/relations.yaml": "relations: []\n",
    };
    const report = checkSpec(withFiles(changes));
    expect(report.issues.filter((i) => i.entityId === "T-user")).toEqual([]);
    expect(report.issues).toMatchObject([{ code: "R7_ORPHAN_TABLE", entityId: "T-session" }]);
  });

  it("un écran citant une feature existante n'est pas orphelin, même sans que la feature le cite", () => {
    const screen =
      '{"id":"S-extra","features":["F-001"],"arbre":{"composant":"C-page"},"etats":[]}';
    expect(checkSpec(withFiles({ "design/screens/S-extra.json": screen })).issues).toEqual([]);
  });

  it("une référence provenant d'une entité en échec de structure ne compte pas", () => {
    const broken =
      "---\nid: F-003\ntitre: Cassée\nstatut: brouillon\npriorite: could\ntables: [T-extra]\ninconnue: 1\n---\n\n## Description\nx\n\n## Critères d'acceptation\n";
    const report = checkSpec(
      withFiles({
        "features/F-003-cassee.md": broken,
        "data/tables/T-extra.yaml": "id: T-extra\nchamps: []\n",
      }),
    );
    expect(codes(report.issues).sort()).toEqual(["R7_ORPHAN_TABLE", "STRUCT_SCHEMA_VIOLATION"]);
    expect(report.ok).toBe(false);
  });

  it("les règles 4/5/7 continuent sur le reste quand un fichier est en échec de structure", () => {
    const changes = {
      "data/tables/T-bad.yaml": "id: [",
      "data/tables/T-audit.yaml": "id: T-audit\nchamps: []\n",
    };
    expect(codes(checkSpec(withFiles(changes)).issues).sort()).toEqual([
      "R7_ORPHAN_TABLE",
      "STRUCT_YAML_SYNTAX",
    ]);
  });
});

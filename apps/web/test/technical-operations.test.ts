import { specOperationSchema } from "@koklo/contract";
import { describe, expect, it } from "vitest";
import { refOf, subtitleOf } from "../src/lib/proposal-labels.ts";
import { planBatches } from "../src/lib/proposal-operations.ts";
import { asTechnical } from "../src/lib/proposal-technical.ts";
import {
  EMPTY_NFR,
  EMPTY_OPERATION,
  nfrIssues,
  nfrOperationOf,
  nfrValuesOf,
  operationIssues,
  operationOperationOf,
  operationValuesOf,
} from "../src/lib/technical-api-forms.ts";
import {
  EMPTY_ENVIRONMENT,
  EMPTY_STACK,
  environmentIssues,
  environmentOperationOf,
  environmentValuesOf,
  stackIssues,
  stackOperationOf,
  stackValuesOf,
} from "../src/lib/technical-operations.ts";
import { fake } from "./support/proposals.tsx";
import { STACK } from "./support/technical.tsx";

/** TK-115 lot C, cas 11 : opérations des feuilles et des propositions du cahier technique. */
const valid = (operation: unknown) => specOperationSchema.safeParse(operation).success;

const STACK_VALUES = {
  ...EMPTY_STACK,
  role: " Génération de PDF ",
  components: ["C-api"],
  status: "chosen" as const,
  choice: "Typst",
  options: ["Typst", "Puppeteer"],
  criteria: ["Rapidité"],
  why: "Rendu rapide.",
  requirements: ["NFR-011"],
};

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("feuille « Choix technique »", () => {
  it("champs obligatoires dans l'ordre du formulaire, deux options au moins", () => {
    expect(stackIssues(EMPTY_STACK).map((issue) => issue.field)).toEqual([
      "role",
      "components",
      "status",
      "options",
      "criteria",
      "why",
    ]);
    expect(stackIssues({ ...STACK_VALUES, options: ["Typst"] })).toEqual([
      { field: "options", message: "Deux options au moins." },
    ]);
    expect(stackIssues({ ...STACK_VALUES, choice: " " }).map((i) => i.field)).toEqual(["choice"]);
    expect(stackIssues({ ...STACK_VALUES, status: "open", choice: "" })).toEqual([]);
    expect(stackIssues(STACK_VALUES)).toEqual([]);
  });

  it("création : opération du contrat, texte rogné", () => {
    const operation = stackOperationOf(STACK_VALUES);
    expect(valid(operation)).toBe(true);
    expect(operation).toMatchObject({
      kind: "stack.create",
      role: "Génération de PDF",
      status: "chosen",
      choice: "Typst",
      criteria: [{ label: "Rapidité" }],
    });
  });

  it("« Pour toute l'équipe » : un choix sans composant se modifie sans en ajouter (B766)", () => {
    const baseline = { ...STACK_VALUES, components: [] };
    const next = { ...baseline, why: "Nouveau." };
    expect(stackIssues(next, baseline)).toEqual([]);
    expect(stackOperationOf(next, { specId: "ST-ci", baseline })).toEqual({
      kind: "stack.update",
      specId: "ST-ci",
      why: "Nouveau.",
    });
    // À la création, ou quand le choix en avait, le composant reste obligatoire (maquette 14 l.890).
    expect(stackIssues(next).map((issue) => issue.field)).toEqual(["components"]);
    expect(stackIssues(next, STACK_VALUES).map((issue) => issue.field)).toEqual(["components"]);
  });

  it("à trancher : jamais de choix envoyé", () => {
    expect(
      stackOperationOf({ ...STACK_VALUES, status: "open", choice: "Typst" }),
    ).not.toHaveProperty("choice");
  });

  it("modification : seuls les champs changés ; les critères gardés sans valeurs réécrites", () => {
    const values = stackValuesOf(STACK[2] as never);
    expect(values.criteria).toEqual(["Prix estimé par SMS", "Données en UE"]);
    const edit = { specId: "ST-sms", baseline: values };
    expect(stackOperationOf(values, edit)).toBeNull();
    expect(stackOperationOf({ ...values, why: "Nouveau." }, edit)).toEqual({
      kind: "stack.update",
      specId: "ST-sms",
      why: "Nouveau.",
    });
    const changed = stackOperationOf({ ...values, criteria: ["Données en UE", "Support"] }, edit);
    expect(changed).toMatchObject({
      criteria: [{ label: "Données en UE" }, { label: "Support" }],
    });
    expect(valid(changed)).toBe(true);
  });
});

describe("feuille « Environnement »", () => {
  const values = {
    ...EMPTY_ENVIRONMENT,
    name: "Démo",
    address: "demo.exemple.fr",
    hosting: "Scaleway",
    database: "PostgreSQL",
    data: "sample" as const,
    deployment: "manual" as const,
  };

  it("obligatoires : nom, adresse, hébergement, base, données, déploiement", () => {
    expect(environmentIssues(EMPTY_ENVIRONMENT).map((issue) => issue.field)).toEqual([
      "name",
      "address",
      "hosting",
      "database",
      "data",
      "deployment",
    ]);
    expect(environmentIssues(values)).toEqual([]);
  });

  it("création puis modification d'un seul champ ; accès vide omis", () => {
    const create = environmentOperationOf(values);
    expect(valid(create)).toBe(true);
    expect(create).not.toHaveProperty("access");
    const baseline = environmentValuesOf({ ...values, specId: "ENV-demo", extras: [] } as never);
    expect(
      environmentOperationOf({ ...baseline, access: "Public" }, { specId: "ENV-demo", baseline }),
    ).toEqual({ kind: "env.update", specId: "ENV-demo", access: "Public" });
  });

  it("« Accès » vidé : la modification l'envoie vide, seul ou avec un autre champ (B765)", () => {
    const baseline = environmentValuesOf({
      ...values,
      specId: "ENV-demo",
      access: "Équipe",
      extras: [],
    } as never);
    const edit = { specId: "ENV-demo", baseline };
    const cleared = environmentOperationOf({ ...baseline, access: "  " }, edit);
    expect(cleared).toEqual({ kind: "env.update", specId: "ENV-demo", access: "" });
    expect(valid(cleared)).toBe(true);
    expect(environmentOperationOf({ ...baseline, access: "", name: "Essai" }, edit)).toEqual({
      kind: "env.update",
      specId: "ENV-demo",
      name: "Essai",
      access: "",
    });
  });
});

const proposals = [
  fake(1, {
    kind: "stack",
    title: "Fournisseur SMS : à trancher",
    content: {
      role: "Fournisseur SMS",
      components: ["C-sms"],
      status: "open",
      options: ["Brevo", "Twilio"],
      criteria: [{ label: "Prix", estimate: true, values: ["≈ 0,04 €", "≈ 0,07 €"] }],
      why: "À comparer.",
      requirements: [],
      decisions: [],
    },
  }),
  fake(2, {
    kind: "op",
    title: "avis.create",
    content: {
      name: "avis.create",
      type: "write",
      zone: "com",
      component: "C-api",
      summary: "Dépose un avis.",
      permission: "public",
      input: [{ field: "note", type: "entier" }],
      output: [],
      errors: [{ code: "DEJA", when: "déjà déposé" }],
      rules: [],
      features: [],
    },
  }),
  fake(3, {
    kind: "nfr",
    content: {
      specId: "NFR-003",
      category: "performance",
      title: "Temps de réponse",
      target: "p95 < 300 ms",
      statement: "Les réservations répondent vite.",
      verification: "ci_measure",
      links: ["C-api"],
    },
  }),
  fake(4, {
    kind: "env",
    content: {
      name: "Recette",
      address: "recette.exemple.fr",
      hosting: "Scaleway",
      database: "PostgreSQL",
      data: "anonymized",
    },
  }),
  asTechnical(
    fake(5, {
      kind: "doc_section",
      content: { specId: "DOC-exploitation", title: "Exploitation", markdown: "Texte." },
    }),
  ),
].map((proposal) => ({ ...proposal, status: "accepted" as const }));

describe("propositions du cahier technique", () => {
  it("cinq opérations du contrat ; specId présent : mise à jour ; document technique", () => {
    const [plan] = planBatches("lancement", proposals);
    expect(plan?.operations.map((operation) => operation.kind)).toEqual([
      "stack.create",
      "op.create",
      "nfr.update",
      "env.create",
      "doc.section.update",
    ]);
    for (const operation of plan?.operations ?? []) expect(valid(operation)).toBe(true);
    expect(plan?.operations[4]).toMatchObject({
      deliverable: "technical",
      specId: "DOC-exploitation",
      status: "a_relire",
    });
  });

  it("identifiants et sous-titres lisibles (maquette 14 l.737-741)", () => {
    expect(proposals.map(refOf)).toEqual([
      "ST-fournisseur-sms",
      "avis.create",
      "NFR-003",
      "ENV-recette",
      "DOC-exploitation",
    ]);
    expect(proposals.map(subtitleOf)).toEqual([
      "Choix · à trancher",
      "écriture · zone com",
      "Exigence · p95 < 300 ms",
      "Environnement",
      "Section · cahier-technique.md",
    ]);
  });

  it("asTechnical ne marque que les sections du document", () => {
    const stack = fake(6, { kind: "stack", content: { role: "API" } });
    expect(asTechnical(stack)).toBe(stack);
  });
});

const OPERATION_VALUES = {
  ...EMPTY_OPERATION,
  name: "waitlist.join",
  type: "write" as const,
  zone: "Prise de rendez-vous",
  summary: " Inscrit un client. ",
  permission: "public",
  input: "serviceId · uuid · service actif\n\nnom · texte(100)",
  output: "position · entier",
  errors: "DEJA_INSCRIT · même téléphone · —\nCRENEAU_PRIS · pris · R-001",
  links: ["F-249", "R-001"],
};

const DETAIL = {
  specId: "reservation.cancel",
  type: "write" as const,
  zone: "Prise de rendez-vous",
  component: "C-api",
  summary: "Annule.",
  permission: "PM-reservation.modifier",
  input: [{ field: "jeton", type: "texte(64)", constraint: "Lien\nd'annulation" }],
  output: [],
  errors: [{ code: "DELAI_DEPASSE", when: "moins de 2 h" }],
  rules: ["R-002"],
  features: ["F-002"],
  rateLimit: "20 par minute",
  callers: [],
  filePath: "api/endpoints/reservation.cancel.yaml",
  commitSha: "a".repeat(40),
};

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("feuille « Opération » (TK-116)", () => {
  it("op.create sans composant : lignes lues, liens séparés en règles et fonctionnalités", () => {
    const operation = operationOperationOf(OPERATION_VALUES);
    expect(valid(operation)).toBe(true);
    expect(operation).toEqual({
      kind: "op.create",
      name: "waitlist.join",
      type: "write",
      zone: "Prise de rendez-vous",
      summary: "Inscrit un client.",
      permission: "public",
      input: [
        { field: "serviceId", type: "uuid", constraint: "service actif" },
        { field: "nom", type: "texte(100)" },
      ],
      output: [{ field: "position", type: "entier" }],
      errors: [
        { code: "DEJA_INSCRIT", when: "même téléphone" },
        { code: "CRENEAU_PRIS", when: "pris", rule: "R-001" },
      ],
      rules: ["R-001"],
      features: ["F-249"],
    });
  });

  it("champs obligatoires, nom et lignes fautives désignées par leur numéro", () => {
    expect(operationIssues(EMPTY_OPERATION).map((issue) => issue.field)).toEqual([
      "name",
      "type",
      "zone",
      "summary",
      "permission",
      "input",
      "output",
    ]);
    const bad = {
      ...OPERATION_VALUES,
      name: "sans point",
      input: "ok · uuid\nnom",
      output: "mauvais champ · uuid",
      errors: "CODE · quand · F-001",
    };
    expect(operationIssues(bad).map((issue) => issue.message)).toEqual([
      "Nom attendu : zone.verbe, ex. avis.create.",
      "Ligne 2 : un nom de champ et un type sont attendus.",
      "Ligne 1 : un nom de champ et un type sont attendus.",
      "Ligne 1 : un code, un « quand » et, au besoin, une règle R-001 sont attendus.",
    ]);
  });

  it("modification : seuls les champs changés ; sortie vide au départ non exigée", () => {
    const baseline = operationValuesOf(DETAIL);
    expect(baseline.input).toBe("jeton · texte(64) · Lien d'annulation");
    expect(baseline.errors).toBe("DELAI_DEPASSE · moins de 2 h");
    expect(baseline.links).toEqual(["R-002", "F-002"]);
    expect(operationIssues(baseline, baseline)).toEqual([]);
    const edit = { specId: "reservation.cancel", baseline };
    expect(operationOperationOf(baseline, edit)).toBeNull();
    const changed = { ...baseline, links: ["R-002"], summary: "Annule vite." };
    expect(operationOperationOf(changed, edit)).toEqual({
      kind: "op.update",
      specId: "reservation.cancel",
      summary: "Annule vite.",
      features: [],
    });
  });

  it("une limite de débit existante ne se vide pas depuis la feuille", () => {
    const baseline = operationValuesOf(DETAIL);
    expect(operationIssues({ ...baseline, rateLimit: "" }, baseline)).toEqual([
      { field: "rateLimit", message: "La limite ne se retire pas d'ici : saisissez-en une." },
    ]);
  });
});

const NFR_VALUES = {
  ...EMPTY_NFR,
  category: "operations" as const,
  title: " Ponctualité ",
  target: "95 % avant 18 h 05",
  statement: "Les rappels partent.",
  verification: "ci_measure" as const,
};

describe("feuille « Exigence » (TK-116)", () => {
  it("nfr.create : champs rognés, liens omis quand vides", () => {
    const operation = nfrOperationOf(NFR_VALUES);
    expect(valid(operation)).toBe(true);
    expect(operation).toEqual({
      ...NFR_VALUES,
      title: "Ponctualité",
      links: undefined,
      kind: "nfr.create",
    });
  });

  it("cinq champs obligatoires ; un lien hors vocabulaire est refusé", () => {
    expect(nfrIssues(EMPTY_NFR)).toHaveLength(5);
    expect(nfrIssues({ ...NFR_VALUES, links: ["F-001"] })[0]?.field).toBe("links");
  });

  it("modification : le détail de vérification du fichier n'est jamais envoyé", () => {
    const baseline = nfrValuesOf({
      specId: "NFR-001",
      category: "data",
      title: "Purge",
      target: "3 ans",
      statement: "Effacées.",
      verification: "scenario",
      verificationDetail: "TS-041",
      links: ["C-api"],
      filePath: "nfr/NFR-001.yaml",
      commitSha: "a".repeat(40),
    });
    const edit = { specId: "NFR-001", baseline };
    expect(nfrOperationOf({ ...baseline, target: "2 ans" }, edit)).toEqual({
      kind: "nfr.update",
      specId: "NFR-001",
      target: "2 ans",
    });
    expect(nfrOperationOf({ ...baseline, links: [] }, edit)).toEqual({
      kind: "nfr.update",
      specId: "NFR-001",
      links: [],
    });
  });
});

import {
  emitComponentYaml,
  emitDocSection,
  emitEnvironmentsYaml,
  emitStackYaml,
  parseDocSection,
  parseSpecFiles,
  SECRET_REFUSAL_MESSAGE,
} from "@koklo/schema";
import { describe, expect, it } from "vitest";
import { integrityProblem } from "./paths.ts";
import { planBatch } from "./plan.ts";
import type { BatchOperation } from "./types.ts";

/**
 * TK-115 lot B (B719 à B724) : opérations `stack.*`, `op.*`, `nfr.*`, `env.*` et sections du cahier technique du plan
 * (pur) : fichiers `tech/`, `api/endpoints/`, `nfr/`, couche déduite, valeurs de critères conservées, REST jamais réécrit,
 * droits, références vérifiées et refus de toute valeur de secret.
 */
const MANIFEST = {
  path: "koklo.project.yaml",
  content: "projet: demo\norganisation: acme\nspec_version: 2\n",
};
const component = (slug: string, type: "app" | "service" | "ext") => ({
  path: `architecture/components/${slug}.yaml`,
  content: emitComponentYaml({
    id: `C-${slug}`,
    nom: slug,
    type,
    zone: "Noyau",
    responsabilite: "Fait son travail.",
    possede: [],
    sert: [],
    depend_de: [],
    decisions: [],
  }),
});
const sms = {
  path: "tech/stack/sms.yaml",
  content: emitStackYaml({
    id: "ST-sms",
    couche: "externes",
    role: "SMS",
    statut: "choisi",
    choix: "Brevo",
    recommande: "Brevo",
    composants: ["C-sms"],
    options: ["Brevo", "Twilio"],
    criteres: [{ nom: "Prix", estimation: true, valeurs: ["≈ 4 €", "≈ 7 €"] }],
    pourquoi: "Rappels.",
  }),
};
const environments = {
  path: "tech/environments.yaml",
  content: emitEnvironmentsYaml({
    environnements: [
      {
        id: "ENV-recette",
        nom: "Recette",
        adresse: "recette.exemple.fr",
        hebergement: "Paris",
        base: "PostgreSQL",
        donnees: "jeux_exemple",
      },
    ],
    variables: [{ nom: "DATABASE_URL", usage: "Base" }],
    integrations: [{ service: "SMS", usage: "Rappels", statut: "a_trancher" }],
  }),
};
const rest = {
  path: "api/endpoints/ancien.lire.yaml",
  content: "id: ancien.lire\nmethode: GET\nchemin: /ancien\n",
};
const objet = (dir: string) => ({
  path: `${dir}/01-objet.md`,
  content: emitDocSection({ title: "Objet", status: "validee", markdown: "But." }),
});
const BASE = [
  MANIFEST,
  component("web", "app"),
  component("sms", "ext"),
  sms,
  environments,
  rest,
  objet("tech/cahier-technique"),
  objet("architecture/overview"),
];

let position = 0;
const op = (kind: string, targetSpecId: string | null, payload = {}): BatchOperation => {
  position += 1;
  return { position, kind, targetSpecId, payload };
};
const plan = (operations: BatchOperation[], authorRole = "dev", files = BASE) =>
  planBatch({ operations, authorRole }, files);
type Result = ReturnType<typeof plan>;
const changes = (result: Result) => ("changes" in result ? result.changes : []);
const contentOf = (result: Result, path: string) => {
  const change = changes(result).find((c) => c.path === path);
  return change && "content" in change ? change.content : undefined;
};
const parsed = (result: Result, path: string) => {
  const content = contentOf(result, path);
  expect(content, JSON.stringify(result)).toBeDefined();
  return parseSpecFiles([{ path, content: content ?? "" }]).spec;
};

const CREATE_STACK = {
  role: "Applications web",
  components: ["C-web"],
  status: "open",
  options: ["Next.js", "Remix"],
  criteria: [{ label: "Rapidité" }],
  why: "Portail.",
};

describe("stack.*", () => {
  it("création : fichier nommé d'après le rôle, couche du premier composant, valeurs inconnues « — »", () => {
    const result = plan([op("stack.create", "ST-applications-web", CREATE_STACK)]);
    const [stack] = parsed(result, "tech/stack/applications-web.yaml").stacks;
    expect(stack?.value).toMatchObject({
      id: "ST-applications-web",
      couche: "applications",
      statut: "a_trancher",
      criteres: [{ nom: "Rapidité", valeurs: ["—", "—"] }],
    });
  });

  it("couche demandée gardée ; sans composant : exploitation", () => {
    const asked = plan([op("stack.create", "ST-a", { ...CREATE_STACK, layer: "data" })]);
    expect(parsed(asked, "tech/stack/a.yaml").stacks[0]?.value.couche).toBe("donnees");
    const bare = plan([op("stack.create", "ST-b", { ...CREATE_STACK, components: [] })]);
    expect(parsed(bare, "tech/stack/b.yaml").stacks[0]?.value.couche).toBe("exploitation");
  });

  it("options modifiées : valeurs et estimation conservées par nom d'option et de critère, couche gardée", () => {
    const result = plan([
      op("stack.update", "ST-sms", {
        options: ["Twilio", "OVH", "Brevo"],
        criteria: [{ label: "Prix" }, { label: "Données en UE" }],
      }),
    ]);
    const stack = parsed(result, "tech/stack/sms.yaml").stacks[0]?.value;
    expect(stack?.criteres).toEqual([
      { nom: "Prix", estimation: true, valeurs: ["≈ 7 €", "—", "≈ 4 €"] },
      { nom: "Données en UE", valeurs: ["—", "—", "—"] },
    ]);
    expect(stack).toMatchObject({ couche: "externes", choix: "Brevo", recommande: "Brevo" });
  });

  it("« Choisir » : choix et statut ; « à trancher » retire le choix ; recommandation retirée avec son option", () => {
    const chosen = plan([op("stack.update", "ST-sms", { status: "chosen", choice: "Twilio" })]);
    expect(parsed(chosen, "tech/stack/sms.yaml").stacks[0]?.value.choix).toBe("Twilio");
    const open = plan([op("stack.update", "ST-sms", { status: "open" })]);
    expect(contentOf(open, "tech/stack/sms.yaml")).not.toContain("choix:");
    const swapped = plan([op("stack.update", "ST-sms", { options: ["Twilio", "OVH"] })]);
    expect(contentOf(swapped, "tech/stack/sms.yaml")).not.toContain("recommande:");
  });

  it("suppression ; composant inconnu : SPEC_INVALID TECH_UNKNOWN_COMPONENT ; absent : conflit", () => {
    expect(changes(plan([op("stack.delete", "ST-sms")]))).toEqual([
      { path: "tech/stack/sms.yaml", delete: true },
    ]);
    const unknown = plan([op("stack.update", "ST-sms", { components: ["C-absent"] })]);
    expect(unknown).toMatchObject({ outcome: { status: "failed", errorCode: "SPEC_INVALID" } });
    expect(JSON.stringify(unknown)).toContain("TECH_UNKNOWN_COMPONENT");
    expect(plan([op("stack.delete", "ST-absent")])).toMatchObject({
      outcome: { status: "conflict" },
    });
  });
});

const CREATE_OP = {
  name: "creneau.listAvailable",
  type: "read",
  zone: "Réservation",
  component: "C-web",
  summary: "Liste les créneaux.",
  permission: "internal",
  input: [{ field: "serviceId", type: "uuid", constraint: "actif" }],
  output: [{ field: "creneaux", type: "liste", note: "triés" }],
  errors: [{ code: "SERVICE_INACTIF", when: "service retiré" }],
  rateLimit: "10 par minute",
};

describe("op.*", () => {
  it("création au format du cahier technique, puis modification d'un champ", () => {
    const created = plan([op("op.create", "creneau.listAvailable", CREATE_OP)]);
    const path = "api/endpoints/creneau.listAvailable.yaml";
    expect(parsed(created, path).operations[0]?.value).toMatchObject({
      id: "creneau.listAvailable",
      type: "lecture",
      composant: "C-web",
      permission: "interne",
      resume: "Liste les créneaux.",
      entree: { serviceId: { type: "uuid", contrainte: "actif" } },
      sortie: { creneaux: { type: "liste", note: "triés" } },
      erreurs: [{ code: "SERVICE_INACTIF", quand: "service retiré" }],
      limite: "10 par minute",
    });
    const files = [...BASE, { path, content: contentOf(created, path) ?? "" }];
    const updated = plan(
      [op("op.update", "creneau.listAvailable", { summary: "Autre." })],
      "dev",
      files,
    );
    expect(parsed(updated, path).operations[0]?.value).toMatchObject({
      resume: "Autre.",
      limite: "10 par minute",
    });
  });

  it("l'ancien format REST n'est jamais réécrit ni supprimé ; son nom reste pris", () => {
    for (const operation of [
      op("op.update", "ancien.lire", { summary: "x" }),
      op("op.delete", "ancien.lire"),
    ]) {
      expect(plan([operation])).toMatchObject({ outcome: { errorCode: "SPEC_INVALID" } });
    }
    const again = op("op.create", "ancien.lire", { ...CREATE_OP, name: "ancien.lire" });
    expect(plan([again])).toMatchObject({ outcome: { status: "conflict" } });
  });
});

const CREATE_NFR = {
  category: "performance",
  title: "Rapidité",
  target: "p95 < 300 ms",
  statement: "Répondre vite.",
  verification: "ci_measure",
  links: ["C-web", "ST-sms"],
};

describe("nfr.*", () => {
  it("création, détail de vérification modifié seul, suppression", () => {
    const created = plan([op("nfr.create", "NFR-001", CREATE_NFR)]);
    const path = "nfr/NFR-001.yaml";
    expect(parsed(created, path).nfrs[0]?.value).toMatchObject({
      categorie: "performance",
      cible: "p95 < 300 ms",
      verification: { mode: "mesure_ci" },
      liens: ["C-web", "ST-sms"],
    });
    const files = [...BASE, { path, content: contentOf(created, path) ?? "" }];
    const detail = plan([op("nfr.update", "NFR-001", { verificationDetail: "k6" })], "dev", files);
    expect(parsed(detail, path).nfrs[0]?.value.verification).toEqual({
      mode: "mesure_ci",
      detail: "k6",
    });
    expect(changes(plan([op("nfr.delete", "NFR-001")], "dev", files))).toEqual([
      { path, delete: true },
    ]);
  });
});

const CREATE_ENV = {
  name: "Production",
  address: "app.exemple.fr",
  hosting: "Paris",
  database: "PostgreSQL",
  data: "real",
  deployment: "version",
  extras: [{ label: "SMS", value: "Réels" }],
  variables: [
    { name: "DATABASE_URL", usage: "Connexion à la base" },
    { name: "SMS_KEY_NAME", usage: "Fournisseur" },
  ],
  integrations: [{ service: "SMS", usage: "Rappels", status: "configured" }],
};

describe("env.*", () => {
  const path = "tech/environments.yaml";

  it("création : ajoutée au fichier, variables et intégrations mises à jour par leur nom", () => {
    const file = parsed(plan([op("env.create", "ENV-production", CREATE_ENV)]), path)
      .environments[0]?.value;
    expect(file?.environnements.map((e) => e.id)).toEqual(["ENV-recette", "ENV-production"]);
    expect(file?.environnements[1]).toMatchObject({
      donnees: "reelles",
      deploiement: "validation",
      lignes: [{ libelle: "SMS", valeur: "Réels" }],
    });
    expect(file?.variables).toEqual([
      { nom: "DATABASE_URL", usage: "Connexion à la base" },
      { nom: "SMS_KEY_NAME", usage: "Fournisseur" },
    ]);
    expect(file?.integrations).toEqual([{ service: "SMS", usage: "Rappels", statut: "configure" }]);
  });

  it("modification et suppression ; premier environnement d'un dépôt sans fichier", () => {
    const updated = plan([op("env.update", "ENV-recette", { access: "Équipe" })]);
    expect(parsed(updated, path).environments[0]?.value.environnements[0]).toMatchObject({
      acces: "Équipe",
      adresse: "recette.exemple.fr",
    });
    const removed = plan([op("env.delete", "ENV-recette")]);
    expect(parsed(removed, path).environments[0]?.value.environnements).toEqual([]);
    const first = plan([op("env.create", "ENV-a", CREATE_ENV)], "dev", [MANIFEST]);
    expect(parsed(first, path).environments[0]?.value.environnements).toHaveLength(1);
  });

  it("« Accès » vidé : la rubrique quitte le fichier, le reste ne change pas (B765)", () => {
    const filled = plan([op("env.update", "ENV-recette", { access: "Équipe" })]);
    const content = contentOf(filled, path) ?? "";
    const files = [...BASE.filter((file) => file.path !== path), { path, content }];
    const cleared = plan([op("env.update", "ENV-recette", { access: "" })], "dev", files);
    const environment = parsed(cleared, path).environments[0]?.value.environnements[0];
    expect(environment).not.toHaveProperty("acces");
    expect(environment).toMatchObject({ adresse: "recette.exemple.fr" });
    expect(contentOf(cleared, path)).not.toContain("acces");
  });

  it("identifiant déjà pris ou absent : conflit", () => {
    for (const operation of [
      op("env.create", "ENV-recette", CREATE_ENV),
      op("env.update", "ENV-absent", { access: "x" }),
    ]) {
      expect(plan([operation])).toMatchObject({ outcome: { status: "conflict" } });
    }
  });
});

describe("sections du cahier technique", () => {
  const technical = (extra: object) => ({ deliverable: "technical", ...extra });

  it("création numérotée dans tech/cahier-technique, sans toucher à l'architecture", () => {
    const result = plan([
      op("doc.section.create", "DOC-tests", technical({ title: "Tests", markdown: "Niveaux." })),
    ]);
    expect(changes(result).map((c) => c.path)).toEqual(["tech/cahier-technique/02-tests.md"]);
  });

  it("même identifiant dans les deux documents : chaque opération vise le sien", () => {
    const result = plan([
      op("doc.section.update", "DOC-objet", technical({ markdown: "Cahier." })),
    ]);
    const content = contentOf(result, "tech/cahier-technique/01-objet.md") ?? "";
    expect(parseDocSection(content).markdown).toBe("Cahier.");
    expect(changes(result)).toHaveLength(1);
    expect(changes(plan([op("doc.section.delete", "DOC-objet", technical({}))]))).toEqual([
      { path: "tech/cahier-technique/01-objet.md", delete: true },
    ]);
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("droits, intégrité et secrets", () => {
  const operations = () => [
    op("stack.delete", "ST-sms"),
    op("env.delete", "ENV-recette"),
    op("nfr.create", "NFR-001", CREATE_NFR),
    op("op.create", "a.b", { ...CREATE_OP, name: "a.b" }),
    op("doc.section.delete", "DOC-objet", { deliverable: "technical" }),
  ];

  it("le designer : FORBIDDEN sur chaque genre", () => {
    for (const operation of operations()) {
      expect(plan([operation], "designer"), operation.kind).toMatchObject({
        outcome: { errorCode: "FORBIDDEN" },
      });
    }
  });

  it("intégrité : genres connus, identifiants à leur motif", () => {
    const batch = (kind: string, targetSpecId: string) => ({
      id: "b",
      organizationId: "o",
      status: "queued" as const,
      branch: "cadrage",
      baseSha: null,
      message: null,
      authorRole: "dev",
      authorUserId: "u",
      operations: [op(kind, targetSpecId)],
      repo: { id: "r", name: "spec", ownerLogin: "acme", specPath: null },
      installation: { externalId: "1", ownerKind: "organization" as const, ownerLogin: "acme" },
    });
    for (const [kind, ok, bad] of [
      ["stack.update", "ST-sms", "sms"],
      ["op.update", "creneau.listAvailable", "E-login"],
      ["nfr.update", "NFR-001", "001"],
      ["env.update", "ENV-recette", "../x"],
    ] as const) {
      expect(integrityProblem(batch(kind, ok)), kind).toBeUndefined();
      expect(integrityProblem(batch(kind, bad)), kind).toBe("specId");
    }
  });

  const secret = `ghp_${"x".repeat(36)}`;

  it.each([
    ["stack.update", "ST-sms", { why: secret }],
    ["env.update", "ENV-recette", { variables: [{ name: "A", usage: secret }] }],
    ["doc.section.update", "DOC-objet", { markdown: `token=${"y".repeat(12)}` }],
    ["feature.create", "F-001", { title: secret, priority: "must" }],
    ["idea.page.write", null, { slug: "vision", contentMd: secret }],
  ])("%s avec un secret : lot en échec SECRET_VALUE, aucun changement", (kind, target, payload) => {
    const result = plan([op(kind, target, payload)]);
    expect(result).toMatchObject({
      outcome: {
        status: "failed",
        errorCode: "SPEC_INVALID",
        report: {
          ok: false,
          issues: [{ code: "SECRET_VALUE", message: SECRET_REFUSAL_MESSAGE }],
        },
      },
    });
    expect("changes" in result).toBe(false);
    expect(JSON.stringify(result)).not.toContain(secret);
  });
});

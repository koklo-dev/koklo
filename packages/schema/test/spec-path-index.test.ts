import { describe, expect, it } from "vitest";
import {
  conflictsOf,
  docSectionIndex,
  featureIdOfPath,
  presentAtHead,
  type SpecPathOperation,
  specPathIndex,
} from "../src/index.ts";

/**
 * TK-114e (B671) : index par chemins de la tête, partagé par le worker et l'API, et conflits d'un lot. `conflictsOf` rend
 * chaque opération en conflit (create d'un identifiant pris, update/delete d'un absent, seconde création d'un même
 * identifiant) ; `isPresent` qui rend `undefined` laisse l'opération non vérifiée.
 */
const PATHS = [
  "features/F-001-inscription.md",
  "domain/rules/R-001-age.md",
  "design/flows/P-001-inscription.json",
  "design/flows/P-reserver.yaml",
  "data/tables/client.yaml",
  "data/tables/T-commande.yaml",
  "data/fixtures/FX-clients.yaml",
  "architecture/components/api.yaml",
  "architecture/flows/P-reserver.yaml",
  "architecture/adr/ADR-001-postgres.md",
  "architecture/overview/03-taches-modeles-de-taches-et-cycle-de-vie.md",
  "architecture/overview/01-contexte.md",
  "tech/stack/sms.yaml",
  "api/endpoints/creneau.listAvailable.yaml",
  "api/endpoints/E-auth.yaml",
  "nfr/NFR-001.yaml",
  "nfr/notes.md",
  "tech/cahier-technique/01-objet.md",
  "tech/cahier-technique/04-securite.md",
  "README.md",
];

const op = (kind: string, targetSpecId: string | null): SpecPathOperation => ({
  kind,
  targetSpecId,
});

describe("specPathIndex (TK-114e)", () => {
  it("indexe chaque genre par son chemin ; un .json hérité occupe son parcours sans être modifiable", () => {
    const index = specPathIndex(PATHS);
    expect([...index.features.keys()]).toEqual(["F-001"]);
    expect(index.rules.get("R-001")).toBe("domain/rules/R-001-age.md");
    expect([...index.flows.taken].sort()).toEqual(["P-001-inscription", "P-reserver"]);
    expect([...index.flows.owned.keys()]).toEqual(["P-reserver"]);
    expect([...index.tables.keys()].sort()).toEqual(["T-client", "T-commande"]);
    expect([...index.fixtures]).toEqual(["FX-clients"]);
    expect(index.components.get("C-api")).toBe("architecture/components/api.yaml");
    expect([...index.archflows.keys()]).toEqual(["P-reserver"]);
    expect([...index.adrs.keys()]).toEqual(["ADR-001"]);
    expect(index.docs.byId.has("DOC-taches-modeles-de-taches-et-cycle-de-vie")).toBe(true);
    expect(index.docs.last).toBe(3);
    expect(featureIdOfPath("features/F-012.md")).toBe("F-012");
    expect(featureIdOfPath("features/notes.md")).toBeUndefined();
    expect(docSectionIndex([]).last).toBe(0);
  });

  it("presentAtHead : genres par chemin vérifiés, rôle et mise en page non vérifiés", () => {
    const index = specPathIndex(PATHS);
    expect(presentAtHead(index, op("doc.section.create", "DOC-contexte"))).toBe(true);
    expect(presentAtHead(index, op("component.update", "C-base"))).toBe(false);
    expect(presentAtHead(index, op("flow.create", "P-001-inscription"))).toBe(true);
    expect(presentAtHead(index, op("flow.update", "P-001-inscription"))).toBe(false);
    expect(presentAtHead(index, op("feature.update", "F-001"))).toBe(true);
    expect(presentAtHead(index, op("role.create", "RL-client"))).toBeUndefined();
    expect(presentAtHead(index, op("layout.save", null))).toBeUndefined();
    expect(presentAtHead(index, op("architecture.layout.save", null))).toBeUndefined();
  });
});

describe("cahier technique (TK-115)", () => {
  const index = specPathIndex(PATHS);

  it("indexe les choix, les opérations (REST compris), les exigences et les sections du cahier", () => {
    expect(index.stacks.get("ST-sms")).toBe("tech/stack/sms.yaml");
    expect([...index.endpoints.keys()].sort()).toEqual(["E-auth", "creneau.listAvailable"]);
    expect([...index.nfr.keys()]).toEqual(["NFR-001"]);
    expect([...index.techDocs.byId.keys()]).toEqual(["DOC-objet", "DOC-securite"]);
    expect(index.techDocs.last).toBe(4);
    expect(index.docs.byId.has("DOC-objet")).toBe(false);
    expect(docSectionIndex(PATHS, "technical").last).toBe(4);
  });

  it("presentAtHead : stack, op et nfr vérifiés ; les environnements ne le sont pas", () => {
    expect(presentAtHead(index, op("stack.update", "ST-sms"))).toBe(true);
    expect(presentAtHead(index, op("stack.create", "ST-zzz"))).toBe(false);
    expect(presentAtHead(index, op("op.update", "creneau.listAvailable"))).toBe(true);
    expect(presentAtHead(index, op("op.create", "avis.create"))).toBe(false);
    expect(presentAtHead(index, op("nfr.delete", "NFR-001"))).toBe(true);
    expect(presentAtHead(index, op("env.create", "ENV-recette"))).toBeUndefined();
  });

  it("une section se cherche dans le dossier de son livrable (architecture par défaut)", () => {
    const section = (deliverable?: string): SpecPathOperation => ({
      ...op("doc.section.update", "DOC-objet"),
      payload: deliverable === undefined ? {} : { deliverable },
    });
    expect(presentAtHead(index, section("technical"))).toBe(true);
    expect(presentAtHead(index, section("architecture"))).toBe(false);
    expect(presentAtHead(index, section())).toBe(false);
    expect(presentAtHead(index, op("doc.section.update", "DOC-contexte"))).toBe(true);
  });

  it("conflit : même section créée dans deux livrables n'est pas un doublon", () => {
    const create = (deliverable: string): SpecPathOperation => ({
      ...op("doc.section.create", "DOC-incidents"),
      payload: { deliverable },
    });
    const isPresent = (operation: SpecPathOperation) => presentAtHead(index, operation);
    expect(conflictsOf([create("technical"), create("architecture")], isPresent)).toEqual([]);
    expect(conflictsOf([create("technical"), create("technical")], isPresent)).toEqual([
      { position: 1, reason: "duplicate" },
    ]);
  });
});

describe("conflictsOf (TK-114e)", () => {
  const index = specPathIndex(PATHS);
  const isPresent = (operation: SpecPathOperation) => presentAtHead(index, operation);

  it("exists : création d'un identifiant pris ; missing : update ou delete d'un absent", () => {
    const operations = [
      op("component.create", "C-base"),
      op("doc.section.create", "DOC-taches-modeles-de-taches-et-cycle-de-vie"),
      op("adr.update", "ADR-009"),
      op("archflow.delete", "P-annuler"),
      op("component.update", "C-api"),
    ];
    expect(conflictsOf(operations, isPresent)).toEqual([
      { position: 1, reason: "exists" },
      { position: 2, reason: "missing" },
      { position: 3, reason: "missing" },
    ]);
  });

  it("duplicate : la seconde création d'un même identifiant du même genre ; un autre genre ne compte pas", () => {
    const operations = [
      op("component.create", "C-base"),
      op("archflow.create", "P-a"),
      op("flow.create", "P-a"),
      op("component.create", "C-base"),
    ];
    expect(conflictsOf(operations, isPresent)).toEqual([{ position: 3, reason: "duplicate" }]);
  });

  it("isPresent indéfini : opération non vérifiée, ni conflit ni doublon", () => {
    const operations = [
      op("role.create", "RL-client"),
      op("role.create", "RL-client"),
      op("layout.save", null),
      op("layout.save", null),
    ];
    expect(conflictsOf(operations, () => undefined)).toEqual([]);
    expect(conflictsOf([], isPresent)).toEqual([]);
  });
});

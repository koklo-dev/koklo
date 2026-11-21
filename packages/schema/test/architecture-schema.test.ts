import { describe, expect, it } from "vitest";
import {
  ActorsFileSchema,
  AdrFrontSchema,
  AdrSchema,
  ARCH_ACTORS_PATH,
  ARCH_ZONES_PATH,
  ArchFlowSchema,
  adrId,
  COMPONENT_TYPES,
  ComponentSchema,
  componentId,
  kindOf,
  PATTERNS,
  parseZones,
} from "../src/index.ts";

/** TK-111 lot A : entités `component`, `archflow`, `adr` et leurs identifiants (cas 1 de la fiche). */
const COMPONENT = {
  id: "C-api",
  nom: "API",
  type: "service",
  zone: "Noyau",
  responsabilite: "Expose les procédures métier.",
};
const FLOW = {
  id: "P-inscription",
  participants: ["RL-visiteur", "C-api"],
  messages: [{ de: "RL-visiteur", vers: "C-api", texte: "Envoie le formulaire" }],
};
const ADR = {
  id: "ADR-001",
  titre: "Base relationnelle",
  statut: "acceptee",
  date: "2026-11-21",
  contexte: "Contexte.",
  decision: "Décision.",
  consequences: { positives: ["Simple"], a_accepter: ["Verticale"] },
  alternatives: [{ nom: "Documentaire", raison: "Trop de liens" }],
};

describe("identifiants C- et ADR-", () => {
  it("C-<slug> et ADR-<nnn>", () => {
    expect(PATTERNS.component.test("C-api")).toBe(true);
    expect(PATTERNS.component.test("C-api-web")).toBe(true);
    expect(PATTERNS.component.test("C-Api")).toBe(false);
    expect(PATTERNS.component.test("api")).toBe(false);
    expect(adrId.safeParse("ADR-001").success).toBe(true);
    expect(adrId.safeParse("ADR-1234").success).toBe(true);
    expect(adrId.safeParse("ADR-1").success).toBe(false);
    expect(componentId.safeParse("C-").success).toBe(false);
  });
});

describe("ComponentSchema", () => {
  it("accepte un composant minimal (listes vides par défaut) et complet", () => {
    const minimal = ComponentSchema.parse(COMPONENT);
    expect(minimal.possede).toEqual([]);
    expect(minimal.sert).toEqual([]);
    expect(minimal.depend_de).toEqual([]);
    expect(minimal.decisions).toEqual([]);
    const full = ComponentSchema.safeParse({
      ...COMPONENT,
      possede: ["T-user"],
      sert: ["F-001"],
      depend_de: [
        { vers: "C-db", via: "SQL" },
        { vers: "C-file", via: "AMQP", mode: "asynchrone" },
      ],
      decisions: ["ADR-001"],
      resume_client: ["Le coeur du produit"],
    });
    expect(full.success).toBe(true);
  });

  it("le vocabulaire des types est fermé", () => {
    expect(COMPONENT_TYPES).toEqual(["app", "service", "store", "queue", "ext"]);
    for (const type of COMPONENT_TYPES) {
      expect(ComponentSchema.safeParse({ ...COMPONENT, type }).success, type).toBe(true);
    }
    expect(ComponentSchema.safeParse({ ...COMPONENT, type: "lambda" }).success).toBe(false);
  });

  it("refuse clé inconnue, champ vide, lien mal formé, mode inconnu", () => {
    const bad = (extra: object) => ComponentSchema.safeParse({ ...COMPONENT, ...extra }).success;
    expect(bad({ extra: 1 })).toBe(false);
    expect(bad({ nom: "" })).toBe(false);
    expect(bad({ zone: "" })).toBe(false);
    expect(bad({ responsabilite: "" })).toBe(false);
    expect(bad({ possede: ["user"] })).toBe(false);
    expect(bad({ sert: ["F-1"] })).toBe(false);
    expect(bad({ decisions: ["ADR-1"] })).toBe(false);
    expect(bad({ depend_de: [{ vers: "api", via: "SQL" }] })).toBe(false);
    expect(bad({ depend_de: [{ vers: "C-db" }] })).toBe(false);
    expect(bad({ depend_de: [{ vers: "C-db", via: "SQL", mode: "synchrone" }] })).toBe(false);
  });
});

describe("ArchFlowSchema", () => {
  it("accepte messages, retour, erreur, blocs alt et séparateurs", () => {
    const flow = {
      ...FLOW,
      messages: [
        { de: "RL-visiteur", vers: "C-api", texte: "Envoie", retour: "Ok" },
        {
          bloc: "alt",
          libelle: "Déjà pris",
          messages: [{ de: "C-api", vers: "RL-visiteur", texte: "Refuse", erreur: "Doublon" }],
        },
        { bloc: "separateur", libelle: "Plus tard" },
      ],
      fonctionnalites: ["F-001"],
      regles: ["R-003"],
      decisions: ["ADR-001"],
    };
    expect(ArchFlowSchema.safeParse(flow).success).toBe(true);
    expect(ArchFlowSchema.parse(FLOW).fonctionnalites).toEqual([]);
  });

  it("refuse un message vers un participant non déclaré, un flux sans message, un id non P-", () => {
    const bad = (extra: object) => ArchFlowSchema.safeParse({ ...FLOW, ...extra }).success;
    expect(bad({ messages: [{ de: "RL-visiteur", vers: "C-inconnu", texte: "x" }] })).toBe(false);
    expect(bad({ messages: [] })).toBe(false);
    expect(bad({ id: "C-api" })).toBe(false);
    expect(bad({ participants: ["T-user", "C-api"] })).toBe(false);
    expect(bad({ extra: true })).toBe(false);
    const inAlt = {
      bloc: "alt",
      libelle: "x",
      messages: [{ de: "C-api", vers: "C-zzz", texte: "x" }],
    };
    expect(bad({ messages: [inAlt] })).toBe(false);
  });
});

describe("AdrSchema et AdrFrontSchema", () => {
  it("accepte un ADR complet ; en clair facultatif ; front sans corps", () => {
    expect(AdrSchema.safeParse(ADR).success).toBe(true);
    expect(AdrSchema.safeParse({ ...ADR, en_clair: "Pour tous." }).success).toBe(true);
    const front = AdrFrontSchema.parse({
      id: "ADR-002",
      titre: "Remplace",
      statut: "remplacee",
      remplacee_par: "ADR-003",
      date: "2026-11-21",
    });
    expect(front.decideurs).toEqual([]);
    expect(front.liens).toEqual([]);
  });

  it("statut fermé, date ISO, remplacee_par en ADR-, alternatives avec nom et raison", () => {
    const bad = (extra: object) => AdrSchema.safeParse({ ...ADR, ...extra }).success;
    expect(bad({ statut: "refusee" })).toBe(false);
    expect(bad({ date: "21/11/2026" })).toBe(false);
    expect(bad({ remplacee_par: "ancien" })).toBe(false);
    expect(bad({ alternatives: [{ nom: "x" }] })).toBe(false);
    expect(bad({ contexte: "" })).toBe(false);
    expect(bad({ extra: 1 })).toBe(false);
  });
});

describe("fichiers tolérants de l'architecture", () => {
  it("_zones.yaml et actors.yaml ne sont pas des entités ; parseZones sert aux deux dossiers", () => {
    expect(ARCH_ZONES_PATH).toBe("architecture/_zones.yaml");
    expect(ARCH_ACTORS_PATH).toBe("architecture/actors.yaml");
    expect(kindOf(ARCH_ZONES_PATH)).toBeUndefined();
    expect(kindOf(ARCH_ACTORS_PATH)).toBeUndefined();
    expect(parseZones("zones:\n  - { nom: Noyau, icone: hub }\n")).toEqual({
      ok: true,
      zones: [{ nom: "Noyau", icone: "hub" }],
    });
  });

  it("actors.yaml : acteurs RL- avec nom", () => {
    const ok = ActorsFileSchema.safeParse({ acteurs: [{ id: "RL-visiteur", nom: "Visiteur" }] });
    expect(ok.success).toBe(true);
    expect(ActorsFileSchema.parse({}).acteurs).toEqual([]);
    expect(ActorsFileSchema.safeParse({ acteurs: [{ id: "C-api", nom: "x" }] }).success).toBe(
      false,
    );
  });
});

import { describe, expect, it } from "vitest";
import {
  archFlowOf,
  componentOf,
  flowDetail,
  flowSummary,
  type KnownParticipants,
  knownParticipants,
  roleNamesOf,
} from "./architecture-flows.ts";

/** TK-112 lot A (B543, B544) : valeurs des flux (résumé, détail, relecture pour la source), lecture tolérante de l'index. */
const KNOWN: KnownParticipants = {
  components: new Map([
    ["C-web", { name: "Application web", type: "app" }],
    ["C-api", { name: "API", type: "service" }],
    ["C-db", { name: "Base", type: "store" }],
    ["C-mail", { name: "Courriel", type: "ext" }],
  ]),
  roles: new Map([["RL-client", "Client"]]),
};

const ARCHFLOW = {
  id: "P-reserver",
  titre: "P-reserver",
  participants: ["RL-client", "C-web", "C-api", "C-db", "C-mail"],
  messages: [
    { de: "RL-client", vers: "C-web", texte: "Réserve", retour: "Confirmation" },
    {
      bloc: "alt",
      libelle: "Créneau pris",
      messages: [{ de: "C-api", vers: "C-web", texte: "Refus", erreur: "409" }],
    },
    { bloc: "separateur", libelle: "Plus tard" },
    { de: "C-api", vers: "C-mail", texte: "Envoie" },
  ],
  fonctionnalites: ["F-001"],
  regles: ["R-001"],
  decisions: ["ADR-001"],
};
const PARCOURS = { titre: "Réserver un soin", acteur: "Cliente" };

describe("flowSummary", () => {
  it("titre et acteur du parcours ; composants et externes comptés sur les participants", () => {
    expect(flowSummary("P-reserver", ARCHFLOW, PARCOURS, KNOWN)).toEqual({
      specId: "P-reserver",
      title: "Réserver un soin",
      actor: "Cliente",
      componentCount: 4,
      externalCount: 1,
    });
  });

  it("sans parcours : titre = identifiant, acteur = nom du premier rôle participant", () => {
    expect(flowSummary("P-reserver", ARCHFLOW, undefined, KNOWN)).toMatchObject({
      title: "P-reserver",
      actor: "Client",
    });
  });

  it("sans parcours ni rôle connu : acteur = identifiant du rôle, sinon vide ; données illisibles : zéros", () => {
    expect(
      flowSummary("P-a", { participants: ["RL-inconnu", "C-api"] }, undefined, KNOWN).actor,
    ).toBe("RL-inconnu");
    expect(flowSummary("P-b", { participants: ["C-api"] }, undefined, KNOWN).actor).toBe("");
    expect(flowSummary("P-c", null, undefined, KNOWN)).toEqual({
      specId: "P-c",
      title: "P-c",
      actor: "",
      componentCount: 0,
      externalCount: 0,
    });
  });
});

describe("flowDetail", () => {
  const where = { filePath: "architecture/flows/P-reserver.yaml", commitSha: "a".repeat(40) };
  const detail = flowDetail("P-reserver", ARCHFLOW, PARCOURS, KNOWN, where);

  it("participants nommés et typés (acteur, puis le type du composant)", () => {
    expect(detail.participants).toEqual([
      { id: "RL-client", name: "Client", type: "actor" },
      { id: "C-web", name: "Application web", type: "app" },
      { id: "C-api", name: "API", type: "service" },
      { id: "C-db", name: "Base", type: "store" },
      { id: "C-mail", name: "Courriel", type: "ext" },
    ]);
  });

  it("éléments : message (retour), bloc alt (erreur), séparateur, dans l'ordre", () => {
    expect(detail.items).toEqual([
      { kind: "message", from: "RL-client", to: "C-web", text: "Réserve", reply: "Confirmation" },
      {
        kind: "alt",
        label: "Créneau pris",
        messages: [{ from: "C-api", to: "C-web", text: "Refus", error: "409" }],
      },
      { kind: "separator", label: "Plus tard" },
      { kind: "message", from: "C-api", to: "C-mail", text: "Envoie" },
    ]);
  });

  it("liens F, R, ADR, titre, acteur, fichier et commit", () => {
    expect(detail).toMatchObject({
      specId: "P-reserver",
      title: "Réserver un soin",
      actor: "Cliente",
      features: ["F-001"],
      rules: ["R-001"],
      decisions: ["ADR-001"],
      ...where,
    });
  });

  it("participant inconnu de l'index : type app, nom = identifiant ; entrées illisibles ignorées", () => {
    const odd = flowDetail(
      "P-x",
      { participants: ["C-nouveau", 3], messages: [{ de: "C-nouveau" }, 4, { bloc: "note" }] },
      undefined,
      KNOWN,
      where,
    );
    expect(odd.participants).toEqual([{ id: "C-nouveau", name: "C-nouveau", type: "app" }]);
    expect(odd.items).toEqual([]);
  });
});

describe("relecture pour la source (YAML, Mermaid)", () => {
  it("archFlowOf : retire le titre d'index et relit le schéma ; illisible : undefined", () => {
    expect(archFlowOf(ARCHFLOW)?.id).toBe("P-reserver");
    expect(archFlowOf({ ...ARCHFLOW, participants: [] })).toBeUndefined();
    expect(archFlowOf(null)).toBeUndefined();
  });

  it("componentOf : retire le titre d'index et relit le schéma ; illisible : undefined", () => {
    const data = {
      id: "C-api",
      titre: "API",
      nom: "API",
      type: "service",
      zone: "Coeur",
      responsabilite: "Expose.",
    };
    expect(componentOf(data)?.nom).toBe("API");
    expect(componentOf({ ...data, type: "lambda" })).toBeUndefined();
  });
});

describe("roleNamesOf et knownParticipants : de quoi nommer les participants", () => {
  it("roleNamesOf : nom des rôles de l'entité roles ; données illisibles : aucune entrée", () => {
    expect(
      roleNamesOf({
        roles: [{ id: "RL-client", nom: "Client" }, { id: "RL-x" }, { id: "T-a", nom: "Table" }, 4],
      }),
    ).toEqual(new Map([["RL-client", "Client"]]));
    expect(roleNamesOf(null)).toEqual(new Map());
    expect(roleNamesOf({ roles: "x" })).toEqual(new Map());
  });

  it("knownParticipants : nom et type des composants indexés, nom des rôles", () => {
    const known = knownParticipants(
      [
        { specId: "C-api", data: { nom: "API", type: "service" } },
        { specId: "C-vide", data: null },
      ],
      { roles: [{ id: "RL-client", nom: "Client" }] },
    );
    expect(known.components.get("C-api")).toEqual({ name: "API", type: "service" });
    expect(known.components.get("C-vide")).toEqual({ name: "C-vide", type: "app" });
    expect(known.roles.get("RL-client")).toBe("Client");
  });
});

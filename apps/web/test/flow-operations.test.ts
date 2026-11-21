import { specBatchSubmitInputSchema } from "@koklo/contract";
import { describe, expect, it } from "vitest";
import {
  EMPTY_FLOW,
  flowIssues,
  flowOperationOf,
  flowValuesOf,
  parseSteps,
  stepsTextOf,
} from "../src/lib/flow-operations.ts";

/** TK-112 lot B, cas 9 : formulaire Flux (B545) : étapes en texte, contrôle, opérations archflow.create|update. */
const STEPS = [
  "RL-client -> C-web : Choisit un créneau",
  "C-web -> C-api : reservation.create | retour: Confirmée",
  "alt: sinon · créneau pris",
  "  C-api -> C-web : Conflit | erreur: 409",
  "fin",
  "--- La veille à 18 h",
].join("\n");
const VALUES = {
  ...EMPTY_FLOW,
  flow: "P-reserver",
  participants: ["RL-client", "C-web", "C-api"],
  steps: STEPS,
  features: ["F-001"],
};

describe("parseSteps", () => {
  it("lit messages, retour, erreur, bloc alt et séparateur", () => {
    const parsed = parseSteps(STEPS);
    expect("items" in parsed && parsed.items).toEqual([
      { from: "RL-client", to: "C-web", text: "Choisit un créneau" },
      { from: "C-web", to: "C-api", text: "reservation.create", reply: "Confirmée" },
      {
        block: "alt",
        label: "sinon · créneau pris",
        messages: [{ from: "C-api", to: "C-web", text: "Conflit", error: "409" }],
      },
      { block: "separator", label: "La veille à 18 h" },
    ]);
  });

  it.each([
    ["C-a vers C-b", 1],
    ["fin", 1],
    ["alt: x\nC-a -> C-b : y", 2],
    ["alt:\nfin", 1],
    ["alt: x\nfin", 2],
    ["C-a -> C-b : y | truc: z", 1],
  ])("« %s » : première ligne à corriger", (text, line) => {
    expect(parseSteps(text)).toMatchObject({ line });
  });

  it("le texte relu d'un flux se relit à l'identique", () => {
    const parsed = parseSteps(STEPS);
    expect("items" in parsed).toBe(true);
    const detail = flowValuesOf({
      specId: "P-reserver",
      title: "Réserver",
      actor: "Client",
      participants: [],
      items: [
        {
          kind: "message",
          from: "C-web",
          to: "C-api",
          text: "reservation.create",
          reply: "Confirmée",
        },
        { kind: "separator", label: "La veille" },
      ],
      features: [],
      rules: [],
      decisions: [],
      filePath: "x",
      commitSha: "a".repeat(40),
    });
    expect(detail.steps).toBe(
      "C-web -> C-api : reservation.create | retour: Confirmée\n--- La veille",
    );
    expect(stepsTextOf([])).toBe("");
  });
});

describe("flowIssues", () => {
  it("valeurs complètes : aucun point à corriger", () => {
    expect(flowIssues(VALUES)).toEqual([]);
  });

  it("formulaire vide : parcours, participants et étapes obligatoires", () => {
    expect(flowIssues(EMPTY_FLOW).map((issue) => issue.field)).toEqual([
      "flow",
      "participants",
      "steps",
    ]);
  });

  it("un participant inconnu dans une étape est nommé ; entre 2 et 12 participants", () => {
    const unknown = flowIssues({ ...VALUES, participants: ["RL-client", "C-web"] });
    expect(unknown).toEqual([
      { field: "steps", message: "« C-api » n'est pas dans les participants." },
    ]);
    expect(flowIssues({ ...VALUES, participants: ["RL-client"] })[0]?.field).toBe("participants");
  });

  it("à la modification, le parcours n'est plus demandé", () => {
    expect(flowIssues({ ...VALUES, flow: "" }, "edit")).toEqual([]);
  });

  it("une puce de lien mal formée est refusée", () => {
    expect(flowIssues({ ...VALUES, decisions: ["ADR-1"] })[0]?.field).toBe("decisions");
  });
});

describe("flowOperationOf", () => {
  const input = (operation: unknown) => ({
    projectId: "7b0c1d52-0000-4000-8000-000000000001",
    idempotencyKey: "7b0c1d52-0000-4000-8000-000000000002",
    branch: "main",
    operations: [operation],
  });

  it("création : une opération archflow.create valide pour le contrat, listes vides omises", () => {
    const operation = flowOperationOf(VALUES);
    expect(operation).toMatchObject({
      kind: "archflow.create",
      flow: "P-reserver",
      features: ["F-001"],
    });
    expect(operation).not.toHaveProperty("rules");
    expect(specBatchSubmitInputSchema.safeParse(input(operation)).success).toBe(true);
  });

  it("modification : les seuls champs changés, rien sans changement", () => {
    expect(flowOperationOf(VALUES, { specId: "P-reserver", baseline: VALUES })).toBeNull();
    const operation = flowOperationOf(
      { ...VALUES, decisions: ["ADR-003"] },
      { specId: "P-reserver", baseline: VALUES },
    );
    expect(operation).toEqual({
      kind: "archflow.update",
      specId: "P-reserver",
      decisions: ["ADR-003"],
    });
    expect(specBatchSubmitInputSchema.safeParse(input(operation)).success).toBe(true);
  });
});

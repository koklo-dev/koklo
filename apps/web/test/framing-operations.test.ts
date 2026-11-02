import { specBatchSubmitInputSchema } from "@koklo/contract";
import { describe, expect, it } from "vitest";
import { acceptedOperations } from "../src/lib/framing-operations.ts";
import type { FramingProposal, ProposalStatus } from "../src/lib/framing-types.ts";
import { PROJECT_ID } from "./support/features.tsx";
import { feature, T1, T2, T3 } from "./support/framing.tsx";

/**
 * TK-59 / 59b, des propositions acceptées aux opérations de specBatch.submit (S-framing §3.6) : seules les
 * acceptées, dans l'ordre affiché, éditions comprises, jamais une rejetée ni une « À relire ».
 */
const proposal = (
  title: string,
  status: ProposalStatus,
  over: Partial<FramingProposal> = {},
): FramingProposal => ({
  id: `p-${title}`,
  status,
  value: feature(title),
  original: feature(title),
  duplicateOf: null,
  ...over,
});

describe("acceptedOperations", () => {
  it("ne garde que les acceptées, dans l'ordre", () => {
    const operations = acceptedOperations([
      proposal(T1, "accepted"),
      proposal(T2, "rejected"),
      proposal(T3, "to_review"),
      proposal("Dernière", "accepted"),
    ]);
    expect(operations.map((op) => (op as { title: string }).title)).toEqual([T1, "Dernière"]);
  });

  it("aucune acceptée : aucune opération", () => {
    expect(acceptedOperations([proposal(T1, "to_review"), proposal(T2, "rejected")])).toEqual([]);
  });

  it("chaque opération est la valeur courante (édition comprise) en feature.create, sans statut ni lien", () => {
    const edited = { ...feature(T1, "should"), title: "  Titre édité  ", description: "Autre" };
    const [op] = acceptedOperations([proposal(T1, "accepted", { value: edited })]);
    expect(op).toMatchObject({
      kind: "feature.create",
      title: "Titre édité",
      priority: "should",
      description: "Autre",
    });
    expect(op).not.toHaveProperty("status");
    for (const key of ["screens", "roles", "rules", "tables", "endpoints", "nfr", "baseSha"]) {
      expect(op).not.toHaveProperty(key);
    }
  });

  it("le résultat est accepté tel quel par le schéma de specBatch.submit", () => {
    const operations = acceptedOperations([proposal(T1, "accepted"), proposal(T2, "accepted")]);
    const input = {
      projectId: PROJECT_ID,
      idempotencyKey: "feature-x",
      branch: "main",
      operations,
    };
    expect(specBatchSubmitInputSchema.safeParse(input).success).toBe(true);
  });

  it("un doublon accepté par l'humain est envoyé comme les autres", () => {
    const operations = acceptedOperations([proposal(T3, "accepted", { duplicateOf: "F-003" })]);
    expect(operations).toHaveLength(1);
  });

  it("n'écrase pas les propositions reçues (valeur initiale intacte)", () => {
    const original = feature(T1);
    const edited = { ...original, title: "Modifié" };
    acceptedOperations([proposal(T1, "accepted", { value: edited, original })]);
    expect(original.title).toBe(T1);
  });
});

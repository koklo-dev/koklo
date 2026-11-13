import { describe, expect, it } from "vitest";
import { generateOpenApi } from "../src/index.ts";
import { errors, INSTANT, input, isValid, output, parsed, proc, UUID, UUID2 } from "./support.ts";

/**
 * TK-99a (contrat 2.9.0, additif) : `ai.proposeDeliverable`, `ai.proposeOptions`, `ai.reviseProposal` et le groupe
 * `proposal` (`list`, `decide`, `decideMany`). Une proposition est une donnée : rien n'entre dans la spec sans
 * `specBatch.submit`. `deliverable` accepte les sept livrables ; seul le Fonctionnel est branché côté serveur.
 */
const PROPOSAL = {
  id: UUID,
  launchId: UUID2,
  kind: "feature",
  zone: "Réservations",
  position: 0,
  title: "Annuler une réservation",
  rationale: "Absent du cahier actuel",
  content: { title: "Annuler une réservation" },
  status: "pending",
  appliedBatchId: null,
  createdAt: INSTANT,
};
const LAUNCH = { id: UUID2, status: "running", proposedCount: 3, discardedCount: 1 };
const DELIVERABLES = [
  "functional",
  "data",
  "architecture",
  "technical",
  "security",
  "design",
  "quality",
];

describe("TK-99a surface : six routes, chemins et méthodes", () => {
  it.each([
    ["ai.proposeDeliverable", "post", "/projects/{projectId}/ai/deliverable/propose"],
    ["ai.proposeOptions", "get", "/projects/{projectId}/ai/deliverable/options"],
    ["ai.reviseProposal", "post", "/projects/{projectId}/ai/proposals/{proposalId}/revise"],
    ["proposal.list", "get", "/projects/{projectId}/proposals"],
    ["proposal.decide", "post", "/projects/{projectId}/proposals/{proposalId}/decision"],
    ["proposal.decideMany", "post", "/projects/{projectId}/proposals/decisions"],
  ])("%s : %s %s", async (name, method, path) => {
    expect(proc(name), name).toBeDefined();
    const doc = (await generateOpenApi()) as { paths: Record<string, Record<string, unknown>> };
    expect(doc.paths[path]?.[method], `${method} ${path}`).toBeDefined();
  });

  it("le groupe proposal contient exactement decide, decideMany, list", async () => {
    const { contract } = await import("../src/index.ts");
    expect(
      Object.keys((contract as unknown as Record<string, object>).proposal ?? {}).sort(),
    ).toEqual(["decide", "decideMany", "list"]);
  });
});

describe("TK-99a ai.proposeDeliverable", () => {
  it("entrée : sept livrables, quatre modes, consigne de 500 caractères au plus", async () => {
    const i = input("ai.proposeDeliverable");
    for (const deliverable of DELIVERABLES) {
      expect(
        await isValid(i, { projectId: UUID, deliverable, mode: "complete" }),
        deliverable,
      ).toBe(true);
    }
    for (const mode of ["complete", "criteria", "update", "all"]) {
      expect(await isValid(i, { projectId: UUID, deliverable: "functional", mode }), mode).toBe(
        true,
      );
    }
    const base = { projectId: UUID, deliverable: "functional", mode: "complete" };
    expect(await isValid(i, { ...base, deliverable: "tout" })).toBe(false);
    expect(await isValid(i, { ...base, mode: "autre" })).toBe(false);
    expect(await isValid(i, { ...base, instruction: "x".repeat(500) })).toBe(true);
    expect(await isValid(i, { ...base, instruction: "x".repeat(501) })).toBe(false);
    expect(await isValid(i, { ...base, instruction: "" })).toBe(false);
    expect(await isValid(i, { ...base, projectId: "x" })).toBe(false);
  });

  it("sortie { launchId, status } sans autre champ ; erreurs : 409 PROPOSAL_IN_PROGRESS et refus du moteur", async () => {
    expect(
      await parsed(output("ai.proposeDeliverable"), { launchId: UUID, status: "queued", x: 1 }),
    ).toEqual({
      launchId: UUID,
      status: "queued",
    });
    const e = errors("ai.proposeDeliverable");
    expect(e.PROPOSAL_IN_PROGRESS?.status).toBe(409);
    for (const code of [
      "LLM_NOT_CONFIGURED",
      "LLM_CAP_REACHED",
      "LLM_RATE_LIMITED",
      "ENCRYPTION_UNAVAILABLE",
      "VALIDATION",
      "FORBIDDEN",
    ]) {
      expect(e[code], code).toBeDefined();
    }
  });
});

describe("TK-107 lot B : types de proposition des Données", () => {
  it("proposal.list : table, relations et fixtures sont des types valides ; un type inconnu est refusé", async () => {
    const out = output("proposal.list");
    const base = {
      nextCursor: null,
      previousCursor: null,
      offset: 0,
      total: 1,
      groups: [],
      launch: null,
    };
    expect(out).toBeDefined();
    for (const kind of ["table", "relations", "fixtures"]) {
      expect(await isValid(out, { ...base, items: [{ ...PROPOSAL, kind }] }), kind).toBe(true);
    }
    expect(await isValid(out, { ...base, items: [{ ...PROPOSAL, kind: "dessin" }] })).toBe(false);
    expect(
      await isValid(input("proposal.list"), {
        projectId: UUID,
        deliverable: "data",
        groupBy: "type",
        group: "fixtures",
      }),
    ).toBe(true);
  });
});

describe("TK-99a ai.proposeOptions", () => {
  it("{ options, reads, available, reason? }", async () => {
    expect(
      await isValid(input("ai.proposeOptions"), { projectId: UUID, deliverable: "functional" }),
    ).toBe(true);
    const out = output("ai.proposeOptions");
    expect(
      await isValid(out, {
        options: [
          { id: "criteria", count: 4, recommended: true },
          { id: "complete", recommended: false },
        ],
        reads: [{ id: "idea.frozen", label: "Dossier d'idée figé" }],
        available: true,
      }),
    ).toBe(true);
    expect(
      await isValid(out, { options: [], reads: [], available: false, reason: "no_frozen_idea" }),
    ).toBe(true);
    expect(
      await isValid(out, {
        options: [{ id: "autre", recommended: true }],
        reads: [],
        available: true,
      }),
    ).toBe(false);
  });
});

describe("TK-99a ai.reviseProposal", () => {
  it("entrée : consigne obligatoire de 1 à 500 caractères ; sortie : une proposition", async () => {
    const i = input("ai.reviseProposal");
    const ok = { projectId: UUID, proposalId: UUID2, instruction: "Plus court" };
    expect(await isValid(i, ok)).toBe(true);
    expect(await isValid(i, { ...ok, instruction: "" })).toBe(false);
    expect(await isValid(i, { ...ok, instruction: "x".repeat(501) })).toBe(false);
    expect(await isValid(output("ai.reviseProposal"), PROPOSAL)).toBe(true);
  });
});

describe("TK-99a proposal.list", () => {
  const list = () => input("proposal.list");
  const base = { projectId: UUID, deliverable: "functional", groupBy: "type_zone" };

  it("entrée : groupBy type|type_zone, status pending|all, limite et curseur du socle", async () => {
    expect(await isValid(list(), base)).toBe(true);
    expect(
      await isValid(list(), {
        ...base,
        groupBy: "type",
        status: "all",
        group: "feature",
        limit: "50",
        cursor: "abc",
      }),
    ).toBe(true);
    expect(await isValid(list(), { ...base, groupBy: "zone" })).toBe(false);
    expect(await isValid(list(), { ...base, status: "accepted" })).toBe(false);
    expect(await isValid(list(), { ...base, limit: "101" })).toBe(false);
    expect(await isValid(list(), { ...base, launchId: "x" })).toBe(false);
  });

  it("sortie : page à curseur, groupes à comptes et lancement (ou null)", async () => {
    const page = {
      items: [PROPOSAL],
      nextCursor: null,
      previousCursor: null,
      offset: 0,
      total: 1,
      groups: [
        {
          key: "feature:Réservations",
          label: "Réservations",
          total: 1,
          accepted: 0,
          rejected: 0,
          pending: 1,
        },
      ],
      launch: LAUNCH,
    };
    expect(await isValid(output("proposal.list"), page)).toBe(true);
    expect(await isValid(output("proposal.list"), { ...page, launch: null })).toBe(true);
    expect(
      await isValid(output("proposal.list"), {
        ...page,
        launch: { ...LAUNCH, errorCode: "worker_lost", finishedAt: INSTANT },
      }),
    ).toBe(true);
    expect(await isValid(output("proposal.list"), { ...page, groups: [{ key: "k" }] })).toBe(false);
  });
});

describe("TK-99a proposal.decide / decideMany", () => {
  it("decide : accept, reject, reset ; charge corrigée facultative ; sortie : la proposition", async () => {
    const i = input("proposal.decide");
    const ok = { projectId: UUID, proposalId: UUID2, decision: "accept" };
    for (const decision of ["accept", "reject", "reset"])
      expect(await isValid(i, { ...ok, decision })).toBe(true);
    expect(await isValid(i, { ...ok, decision: "delete" })).toBe(false);
    expect(await isValid(i, { ...ok, edited: { title: "Corrigée" } })).toBe(true);
    expect(await isValid(i, { ...ok, edited: "texte" })).toBe(false);
    expect(await isValid(output("proposal.decide"), PROPOSAL)).toBe(true);
    expect(errors("proposal.decide").CONFLICT).toBeDefined();
  });

  it("decideMany : un groupe, accept seulement, N attendu ; sortie { decided } ; 409 si le N a changé", async () => {
    const i = input("proposal.decideMany");
    const ok = {
      projectId: UUID,
      launchId: UUID2,
      group: "feature:Réservations",
      decision: "accept",
      expectedPending: 112,
    };
    expect(await isValid(i, ok)).toBe(true);
    expect(await isValid(i, { ...ok, decision: "reject" })).toBe(false);
    expect(await isValid(i, { ...ok, expectedPending: -1 })).toBe(false);
    expect(await isValid(i, { ...ok, expectedPending: undefined })).toBe(false);
    expect(await isValid(i, { ...ok, group: "" })).toBe(false);
    expect(await parsed(output("proposal.decideMany"), { decided: 112 })).toEqual({ decided: 112 });
    expect(errors("proposal.decideMany").PROPOSAL_COUNT_CHANGED?.status).toBe(409);
  });
});

describe("TK-99a specBatch.submit : 200 opérations et proposalIds", () => {
  const op = (n: number) => ({
    kind: "feature.delete",
    specId: `F-${String(n + 1).padStart(3, "0")}`,
  });
  const ops = (n: number) => Array.from({ length: n }, (_, k) => op(k));
  const submit = (extra: Record<string, unknown>) => ({
    projectId: UUID,
    idempotencyKey: "k-1",
    operations: ops(1),
    ...extra,
  });

  it("accepte 200 opérations et refuse la 201e", async () => {
    const i = input("specBatch.submit");
    expect(await isValid(i, submit({ operations: ops(200) }))).toBe(true);
    expect(await isValid(i, submit({ operations: ops(201) }))).toBe(false);
  });

  it("proposalIds facultatif : 200 identifiants au plus, des UUID", async () => {
    const i = input("specBatch.submit");
    expect(await isValid(i, submit({}))).toBe(true);
    expect(await isValid(i, submit({ proposalIds: [UUID, UUID2] }))).toBe(true);
    expect(await isValid(i, submit({ proposalIds: Array.from({ length: 200 }, () => UUID) }))).toBe(
      true,
    );
    expect(await isValid(i, submit({ proposalIds: Array.from({ length: 201 }, () => UUID) }))).toBe(
      false,
    );
    expect(await isValid(i, submit({ proposalIds: ["x"] }))).toBe(false);
  });
});

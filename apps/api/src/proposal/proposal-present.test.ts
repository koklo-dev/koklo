import { specPathIndex } from "@koklo/schema";
import { describe, expect, it } from "vitest";
import { alreadyPresentIds, presentTargetOf } from "./proposal-present.ts";

/**
 * TK-114g lot A (B699) : une création `doc_section`, `component`, `archflow` ou `flow` dont l'identifiant est déjà dans
 * l'arbre au commit indexé est « déjà présente ». Une mise à jour (`specId` posé par le worker) ne l'est jamais. Fonction pure.
 */
const record = (id: string, kind: string, payload: Record<string, unknown>) => ({
  id,
  kind,
  payload,
});

const HEAD = specPathIndex([
  "architecture/overview/01-contexte.md",
  "architecture/overview/02-taches-modeles-de-taches-et-cycle-de-vie.md",
  "architecture/components/api.yaml",
  "architecture/flows/P-reserver.yaml",
  "design/flows/P-payer.yaml",
]);

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même fonction, un test par comportement
describe("presentTargetOf (TK-114g, B699)", () => {
  it("créations : identifiant déduit du contenu, comme l'enregistrement", () => {
    expect(
      presentTargetOf(
        record("a", "doc_section", { title: "Tâches, modèles de tâches et cycle de vie" }),
      ),
    ).toEqual({
      kind: "doc.section.create",
      targetSpecId: "DOC-taches-modeles-de-taches-et-cycle-de-vie",
    });
    expect(presentTargetOf(record("b", "component", { name: "API" }))).toEqual({
      kind: "component.create",
      targetSpecId: "C-api",
    });
    expect(presentTargetOf(record("c", "archflow", { flow: "P-reserver" }))).toEqual({
      kind: "archflow.create",
      targetSpecId: "P-reserver",
    });
    expect(presentTargetOf(record("d", "flow", { title: "Payer" }))).toEqual({
      kind: "flow.create",
      targetSpecId: "P-payer",
    });
  });

  it("mises à jour (specId posé) et autres types : jamais réglés", () => {
    expect(presentTargetOf(record("a", "component", { name: "API", specId: "C-api" }))).toBeNull();
    expect(
      presentTargetOf(record("b", "archflow", { flow: "P-reserver", specId: "P-reserver" })),
    ).toBeNull();
    expect(presentTargetOf(record("c", "archflow", {}))).toBeNull();
    expect(presentTargetOf(record("d", "feature", { title: "Réserver" }))).toBeNull();
    expect(presentTargetOf(record("e", "adr", { title: "Base" }))).toBeNull();
    expect(presentTargetOf(record("f", "role", { name: "Client" }))).toBeNull();
  });
});

describe("alreadyPresentIds (TK-114g, B699)", () => {
  it("rend, dans l'ordre, les créations dont l'identifiant est à la tête", () => {
    const records = [
      record("doc", "doc_section", { title: "Tâches, modèles de tâches et cycle de vie" }),
      record("new-doc", "doc_section", { title: "Observabilité" }),
      record("api", "component", { name: "API" }),
      record("upd", "component", { name: "API", specId: "C-api" }),
      record("flux", "archflow", { flow: "P-reserver" }),
      record("pay", "flow", { title: "Payer" }),
      record("cache", "component", { name: "Cache" }),
    ];
    expect(alreadyPresentIds(records, HEAD)).toEqual(["doc", "api", "flux", "pay"]);
  });

  it("tête vide : rien", () => {
    expect(
      alreadyPresentIds([record("doc", "doc_section", { title: "Contexte" })], specPathIndex([])),
    ).toEqual([]);
  });
});

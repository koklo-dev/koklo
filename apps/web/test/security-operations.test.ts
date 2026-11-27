import { describe, expect, it } from "vitest";
import {
  EMPTY_SENSITIVE,
  EMPTY_THREAT,
  sensitiveIssues,
  sensitiveOperationOf,
  sensitivePrefillValues,
  sensitiveValuesOf,
  threatIssues,
  threatOperationOf,
  threatPrefillValues,
  threatValuesOf,
} from "../src/lib/security-operations.ts";
import { dataRow, detailOf } from "./support/security.tsx";

/** TK-117 lot C : saisies des feuilles Menace et Donnée (maquette 15 l.706-715, A7). */
const threatInput = {
  ...EMPTY_THREAT,
  title: " Créneaux bloqués ",
  category: "abuse" as const,
  severity: "medium" as const,
  surfaces: ["F-004", "API"],
  risk: "Un concurrent réserve tout.",
  measures: "Code SMS.\n\n2 réservations au plus.",
  verification: "scenario" as const,
};

describe("feuille Menace", () => {
  it("champs obligatoires, parades comprises", () => {
    expect(threatIssues(EMPTY_THREAT).map((issue) => issue.field)).toEqual([
      "title",
      "category",
      "severity",
      "surfaces",
      "risk",
      "measures",
      "verification",
    ]);
    expect(threatIssues({ ...threatInput, surfaces: ["accueil"] })[0]?.field).toBe("surfaces");
  });

  it("création : lignes de parades, « API » en minuscules", () => {
    expect(threatOperationOf(threatInput)).toEqual({
      kind: "threat.create",
      title: "Créneaux bloqués",
      category: "abuse",
      severity: "medium",
      surfaces: ["F-004", "api"],
      risk: "Un concurrent réserve tout.",
      measures: ["Code SMS.", "2 réservations au plus."],
      verification: "scenario",
    });
  });

  it("modification : seuls les champs changés ; rien changé, aucune opération", () => {
    const baseline = threatValuesOf(detailOf("SEC-T01") as never);
    expect(baseline.surfaces).toEqual(["F-009"]);
    expect(threatOperationOf(baseline, { specId: "SEC-T01", baseline })).toBeNull();
    expect(
      threatOperationOf({ ...baseline, severity: "low" }, { specId: "SEC-T01", baseline }),
    ).toEqual({ kind: "threat.update", specId: "SEC-T01", severity: "low" });
  });

  it("préremplissage : parades en lignes", () => {
    const values = threatPrefillValues({
      type: "threat",
      values: { title: "T", measures: ["a", "b"], surfaces: ["api"] },
    } as never);
    expect(values).toEqual({ title: "T", measures: "a\nb", surfaces: ["API"] });
  });
});

const dataInput = {
  ...EMPTY_SENSITIVE,
  data: "Photo",
  fields: "reservations.photo",
  category: "personal" as const,
  retention: "6 mois",
  access: ["Gérante"],
};

describe("feuille Donnée", () => {
  it("conservation obligatoire pour personnelle, contact et santé seulement", () => {
    const fields = (values: typeof dataInput) => sensitiveIssues(values).map((i) => i.field);
    expect(fields({ ...dataInput, retention: "" })).toEqual(["retention"]);
    expect(fields({ ...dataInput, retention: "", category: "technical" as never })).toEqual([]);
    expect(fields({ ...dataInput, fields: "pas un champ !" })).toEqual(["fields"]);
    expect(sensitiveIssues(EMPTY_SENSITIVE).map((i) => i.field)).toEqual([
      "data",
      "fields",
      "category",
      "access",
    ]);
  });

  it("création : champs séparés par des virgules, suggestion gardée à part", () => {
    expect(
      sensitiveOperationOf({
        ...dataInput,
        fields: "clients.nom, clients.prenom",
        suggestion: "1 an",
      }),
    ).toEqual({
      kind: "sensitive.create",
      data: "Photo",
      fields: ["clients.nom", "clients.prenom"],
      category: "personal",
      retention: "6 mois",
      retentionSuggestion: "1 an",
      access: ["Gérante"],
    });
  });

  it("modification : seuls les changements ; la suggestion lue reste une aide", () => {
    const baseline = sensitiveValuesOf({
      ...dataRow("reservations.note", { retention: undefined, retentionSuggestion: "1 an" }),
    } as never);
    expect(baseline.retention).toBe("");
    expect(baseline.suggestion).toBe("1 an");
    expect(
      sensitiveOperationOf(
        { ...baseline, retention: "2 ans" },
        { specId: "reservations.note", baseline },
      ),
    ).toEqual({ kind: "sensitive.update", specId: "reservations.note", retention: "2 ans" });
  });

  it("préremplissage : jamais de conservation, la suggestion devient une aide (A7)", () => {
    const values = sensitivePrefillValues({
      type: "sensitive",
      values: { field: "a.b", data: "D", retentionSuggestion: "6 mois" },
    } as never);
    expect(values).toEqual({ fields: "a.b", data: "D", suggestion: "6 mois" });
    expect(values).not.toHaveProperty("retention");
  });
});

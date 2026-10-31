import { describe, expect, it } from "vitest";
import { fieldOfIssue } from "../src/lib/spec-issues.ts";

/**
 * TK-48 / 48e : un diagnostic `SPEC_INVALID` est rattaché à un champ du formulaire quand son `pointer` le
 * nomme (best effort, Q5 : le format exact du pointeur n'est pas spécifié ; repli = la liste, `null`).
 */
describe("fieldOfIssue", () => {
  it.each([
    ["/title", "title"],
    ["/feature/title", "title"],
    ["/priority", "priority"],
    ["/status", "status"],
    ["/description", "description"],
    ["/criteria", "criteria"],
    ["/criteria/0/title", "criteria"],
    ["/criteria/1/steps/2/text", "criteria"],
    ["/screens/0", "screens"],
    ["/roles/1", "roles"],
    ["/rules/0", "rules"],
    ["/tables/0", "tables"],
    ["/endpoints/3", "endpoints"],
    ["/nfr/0", "nfr"],
    ["#/feature/screens/0", "screens"],
  ])("pointeur %s -> %s", (pointer, field) => {
    expect(fieldOfIssue({ pointer })).toBe(field);
  });

  it.each([
    ["pointeur vide", { pointer: "" }],
    ["champ inconnu", { pointer: "/unknown/0" }],
    ["entité seule", { pointer: "", entityId: "F-001" }],
    ["fichier", { pointer: "/schemaVersion" }],
  ])("%s : pas de champ (le diagnostic reste dans la liste)", (_name, issue) => {
    expect(fieldOfIssue(issue)).toBeNull();
  });
});

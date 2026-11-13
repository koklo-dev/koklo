import { describe, expect, it } from "vitest";
import { input, isValid, output, UUID, UUID2 } from "./support.ts";

/**
 * TK-100 lot B (B325 c, d, e) : `review.submit` et `review.list` s'étendent aux parcours (`flow`), au bloc des règles
 * (`rules`), au bloc des rôles (`roles`) et au livrable entier (`deliverable`). La référence suit le genre ; `onBehalf`
 * dit qu'une validation a été posée par l'équipe, sans client. Les écrans restent masqués (D2).
 */
const SHA40 = "a".repeat(40);
const submit = (over: Record<string, unknown>) => ({
  projectId: UUID,
  targetKind: "feature",
  targetRef: "F-001",
  version: SHA40,
  status: "approved",
  ...over,
});
const LISTED = {
  id: UUID,
  targetKind: "feature",
  targetRef: "F-001",
  sha: SHA40,
  status: "approved",
  authorId: UUID2,
  authorRole: "owner",
  authorName: null,
  comment: null,
  createdAt: "2026-11-04T10:00:00.000Z",
  current: true,
  onBehalf: true,
};

describe("review.submit : nouvelles cibles", () => {
  it.each([
    ["flow", "P-001"],
    ["flow", "P-001-inscription"],
    ["rules", "rules"],
    ["roles", "roles"],
    ["deliverable", "functional"],
    ["deliverable", "quality"],
  ])("accepte %s / %s", async (targetKind, targetRef) => {
    expect(await isValid(input("review.submit"), submit({ targetKind, targetRef }))).toBe(true);
  });

  it.each([
    ["flow avec une référence de feature", { targetKind: "flow", targetRef: "F-001" }],
    ["rules avec une autre référence", { targetKind: "rules", targetRef: "R-001" }],
    ["roles avec une autre référence", { targetKind: "roles", targetRef: "rules" }],
    ["livrable hors liste", { targetKind: "deliverable", targetRef: "screens" }],
    ["livrable avec majuscule", { targetKind: "deliverable", targetRef: "Functional" }],
    ["feature avec le nom d'un livrable", { targetKind: "feature", targetRef: "functional" }],
    ["écran toujours masqué (D2)", { targetKind: "screen", targetRef: "S-home" }],
  ])("refuse %s", async (_label, over) => {
    expect(await isValid(input("review.submit"), submit(over))).toBe(false);
  });
});

describe("review.list : filtre et sortie", () => {
  it("filtre par les nouveaux genres", async () => {
    for (const targetKind of ["flow", "rules", "roles", "deliverable"]) {
      expect(await isValid(input("review.list"), { projectId: UUID, targetKind })).toBe(true);
    }
  });

  it("chaque entrée porte onBehalf (booléen obligatoire) et accepte les nouveaux genres", async () => {
    const o = output("review.list");
    const item = (over: Record<string, unknown>) => ({
      items: [{ ...LISTED, ...over }],
      nextCursor: null,
    });
    expect(await isValid(o, item({}))).toBe(true);
    expect(await isValid(o, item({ targetKind: "deliverable", targetRef: "design" }))).toBe(true);
    expect(await isValid(o, item({ onBehalf: undefined }))).toBe(false);
    expect(await isValid(o, item({ onBehalf: "oui" }))).toBe(false);
    // Le SHA n'est jamais montré au client (D7) : nul pour lui, 40 ou 64 hexadécimaux pour l'équipe.
    expect(await isValid(o, item({ sha: null }))).toBe(true);
    expect(await isValid(o, item({ sha: "pas un sha" }))).toBe(false);
    expect(await isValid(o, item({ targetKind: "screen" }))).toBe(false);
  });
});

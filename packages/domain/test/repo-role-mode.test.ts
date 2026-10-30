import { describe, expect, it } from "vitest";
import { REPO_MODES, REPO_ROLES } from "../src/index.ts";

describe("REPO_ROLES et REPO_MODES (CDC §4)", () => {
  it("REPO_ROLES contient les cinq rôles, dans l'ordre", () => {
    expect([...REPO_ROLES]).toEqual(["spec", "front", "back", "monorepo", "mobile"]);
  });

  it("REPO_MODES contient new et adopted, dans l'ordre", () => {
    expect([...REPO_MODES]).toEqual(["new", "adopted"]);
  });

  it("les deux listes sont gelées", () => {
    expect(Object.isFrozen(REPO_ROLES)).toBe(true);
    expect(Object.isFrozen(REPO_MODES)).toBe(true);
  });
});

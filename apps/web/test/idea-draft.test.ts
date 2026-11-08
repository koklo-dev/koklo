// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { endFeatureSession } from "../src/lib/feature-draft.ts";
import { clearIdeaDraft, readIdeaDraft, saveIdeaDraft } from "../src/lib/idea-draft.ts";

const ME = { userId: "u1", organizationId: "o1" };
const P = "11111111-1111-4111-8111-111111111111";
const PAGE = "22222222-2222-4222-8222-222222222222";

beforeEach(() => localStorage.clear());

describe("T18 copie locale cloisonnée", () => {
  it("relit la saisie du même compte, organisation et projet", () => {
    saveIdeaDraft(ME, P, PAGE, { contentMd: "texte", baseVersion: 2 });
    expect(readIdeaDraft(ME, P, PAGE)).toMatchObject({ contentMd: "texte", baseVersion: 2 });
  });

  it("un autre compte ne la voit pas et elle est supprimée", () => {
    saveIdeaDraft(ME, P, PAGE, { contentMd: "texte", baseVersion: 2 });
    expect(readIdeaDraft({ userId: "u2", organizationId: "o1" }, P, PAGE)).toBeNull();
    expect(readIdeaDraft(ME, P, PAGE)).toBeNull();
  });

  it("une autre organisation ni un autre projet ne la voient", () => {
    saveIdeaDraft(ME, P, PAGE, { contentMd: "texte", baseVersion: 2 });
    expect(readIdeaDraft({ userId: "u1", organizationId: "o2" }, P, PAGE)).toBeNull();
    saveIdeaDraft(ME, P, PAGE, { contentMd: "texte", baseVersion: 2 });
    expect(readIdeaDraft(ME, "33333333-3333-4333-8333-333333333333", PAGE)).toBeNull();
  });

  it("sans portée (session inconnue) rien n'est écrit", () => {
    expect(saveIdeaDraft(null, P, PAGE, { contentMd: "x", baseVersion: 1 })).toBe(false);
  });

  it("expire après 7 jours", () => {
    saveIdeaDraft(ME, P, PAGE, { contentMd: "x", baseVersion: 1 });
    expect(readIdeaDraft(ME, P, PAGE, Date.now() + 8 * 24 * 3600 * 1000)).toBeNull();
  });

  it("effacée à la déconnexion", () => {
    saveIdeaDraft(ME, P, PAGE, { contentMd: "x", baseVersion: 1 });
    endFeatureSession();
    expect(localStorage.length).toBe(0);
  });

  it("clearIdeaDraft supprime la copie", () => {
    saveIdeaDraft(ME, P, PAGE, { contentMd: "x", baseVersion: 1 });
    clearIdeaDraft(P, PAGE);
    expect(readIdeaDraft(ME, P, PAGE)).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import * as schemas from "../src/schemas.ts";
import { auditEntry, comment, errors, input, isValid, output, UUID, UUID2 } from "./support.ts";

/** Corrections de typage regroupées dans 0.5.0 (notes TK-29 -> TK-32, analyse TK-42 §6). */
describe("K1 comment.* : VALIDATION et NOT_FOUND typés", () => {
  it.each(["comment.create", "comment.list"])(
    "%s expose VALIDATION 422 { field, message }",
    async (name) => {
      const e = errors(name).VALIDATION;
      expect(e?.status, name).toBe(422);
      expect(await isValid(e?.data, { field: "targetId", message: "cible inconnue" })).toBe(true);
      expect(await isValid(e?.data, { field: "targetId" })).toBe(false);
    },
  );
  it.each(["comment.create", "comment.list"])(
    "%s expose NOT_FOUND 404 (cible hors projet)",
    (name) => {
      expect(errors(name).NOT_FOUND?.status, name).toBe(404);
    },
  );
  it("comment.delete garde NOT_FOUND et n'expose pas VALIDATION", () => {
    expect(errors("comment.delete").NOT_FOUND?.status).toBe(404);
    expect(errors("comment.delete").VALIDATION).toBeUndefined();
  });
});

describe("K2 FORBIDDEN typé sur comment.list et projectState.get", () => {
  it.each(["comment.list", "projectState.get"])("%s expose FORBIDDEN 403", (name) => {
    expect(errors(name).FORBIDDEN?.status, name).toBe(403);
  });
  it("audit.list l'expose déjà (non-régression)", () => {
    expect(errors("audit.list").FORBIDDEN?.status).toBe(403);
  });
  it("les autres lectures ouvertes à tous restent sans FORBIDDEN", () => {
    for (const name of [
      "ticket.get",
      "ticket.list",
      "dependency.list",
      "sprint.get",
      "sprint.list",
      "lease.get",
    ]) {
      expect(errors(name).FORBIDDEN, name).toBeUndefined();
    }
  });
});

describe("K3 commentSchema.authorId nullable (commentaire système)", () => {
  it("accepte null, refuse la chaîne vide", async () => {
    expect(await isValid(schemas.commentSchema, { ...comment, authorId: null })).toBe(true);
    expect(await isValid(output("comment.create"), { ...comment, authorId: null })).toBe(true);
    expect(
      await isValid(output("comment.list"), {
        items: [{ ...comment, authorId: null }],
        nextCursor: null,
      }),
    ).toBe(true);
    expect(
      await isValid(schemas.commentSchema, { ...comment, authorKind: "system", authorId: null }),
    ).toBe(true);
    expect(await isValid(schemas.commentSchema, { ...comment, authorId: "" })).toBe(false);
  });
  it("authorId reste obligatoire (null explicite, pas absent)", async () => {
    expect(await isValid(schemas.commentSchema, { ...comment, authorId: undefined })).toBe(false);
  });
});

describe("K4 targetId en uuid (commentaire et audit)", () => {
  const bad = ["TK-1", "pas-un-uuid", "", "123"];
  it("commentSchema, comment.create et comment.list", async () => {
    expect(await isValid(schemas.commentSchema, { ...comment, targetId: UUID })).toBe(true);
    for (const targetId of bad) {
      expect(await isValid(schemas.commentSchema, { ...comment, targetId }), targetId).toBe(false);
      expect(
        await isValid(input("comment.create"), { targetKind: "ticket", targetId, body: "x" }),
        targetId,
      ).toBe(false);
      expect(
        await isValid(input("comment.list"), { targetKind: "ticket", targetId }),
        targetId,
      ).toBe(false);
    }
    expect(
      await isValid(input("comment.create"), { targetKind: "ticket", targetId: UUID2, body: "x" }),
    ).toBe(true);
    expect(await isValid(input("comment.list"), { targetKind: "ticket", targetId: UUID2 })).toBe(
      true,
    );
  });
  it("auditEntrySchema", async () => {
    expect(await isValid(schemas.auditEntrySchema, auditEntry)).toBe(true);
    for (const targetId of bad) {
      expect(await isValid(schemas.auditEntrySchema, { ...auditEntry, targetId }), targetId).toBe(
        false,
      );
    }
  });
});

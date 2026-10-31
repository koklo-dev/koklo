import { describe, expect, it } from "vitest";
import {
  isFeatureId,
  isSafeSpecPath,
  isValidBranchName,
  KOKLO_BOT_AUTHOR,
  SPEC_BATCH_ERROR_CODES,
  SPEC_WRITE_QUEUE,
  specWriteSingletonKey,
} from "../src/index.ts";

describe("spec-write", () => {
  it("nomme la file et sa clé de sérialisation par dépôt et branche", () => {
    expect(SPEC_WRITE_QUEUE).toBe("spec-write");
    expect(specWriteSingletonKey("repo", "cadrage")).toBe("repo:cadrage");
  });

  it("l'auteur du bot est figé et la liste des codes fermée", () => {
    expect(Object.isFrozen(KOKLO_BOT_AUTHOR)).toBe(true);
    expect(SPEC_BATCH_ERROR_CODES).toContain("write_conflict");
    expect(SPEC_BATCH_ERROR_CODES).toHaveLength(8);
  });
});

describe("spec-write : identifiants et noms", () => {
  it.each(["F-001", "F-1234"])("%s est un identifiant de feature", (id) => {
    expect(isFeatureId(id)).toBe(true);
  });

  it.each(["", "F-01", "F-001/x", "../x", "f-001", 7, undefined])(
    "%j n'est pas un identifiant de feature",
    (id) => {
      expect(isFeatureId(id)).toBe(false);
    },
  );

  it.each(["cadrage", "feat/x-y", "release-1.2", "a@b"])("branche %j valide", (name) => {
    expect(isValidBranchName(name)).toBe(true);
  });

  it.each([
    "",
    "@",
    "../x",
    "/x",
    ".git/hooks",
    "a/../b",
    "a//b",
    "fin/",
    "avec espace",
    "x.lock",
    "a/x.lock/b",
    "..",
    "a\\b",
    "a~b",
    "a^b",
    "a:b",
    "a?b",
    "a*b",
    "a[b",
    "a@{b",
    "fin.",
    "ctl\u0007",
    "x".repeat(201),
    undefined,
  ])("branche %j refusée", (name) => {
    expect(isValidBranchName(name)).toBe(false);
  });
});

describe("spec-write : specPath", () => {
  it.each(["docs", "docs/spec", "a.b/c-d"])("specPath %j valide", (path) => {
    expect(isSafeSpecPath(path)).toBe(true);
  });

  it.each([
    "",
    "/abs",
    "../x",
    "a/../b",
    "a/./b",
    ".git",
    "a/.GIT/b",
    "docs//spec",
    "a\\b",
    "a\u0000b",
    3,
  ])("specPath %j refusé", (path) => {
    expect(isSafeSpecPath(path)).toBe(false);
  });
});

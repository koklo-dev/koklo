import { describe, expect, it } from "vitest";
import {
  GitAuthExpiredError,
  GitConflictError,
  GitNotFoundError,
  GitProviderError,
  GitProviderUnavailableError,
  GitRateLimitedError,
  RepoCreationForbiddenError,
  UserTokenRequiredError,
} from "../src/index.ts";

const owner = { kind: "user", login: "ada" } as const;

const CASES = [
  {
    name: "RepoCreationForbiddenError",
    error: new RepoCreationForbiddenError({
      operation: "createRepo",
      owner,
      reason: "resource-not-accessible",
    }),
    ctor: RepoCreationForbiddenError,
    fields: { operation: "createRepo", owner, reason: "resource-not-accessible" },
  },
  {
    name: "UserTokenRequiredError",
    error: new UserTokenRequiredError({ operation: "createRepo", owner }),
    ctor: UserTokenRequiredError,
    fields: { operation: "createRepo", owner },
  },
  {
    name: "GitAuthExpiredError",
    error: new GitAuthExpiredError({ operation: "readFile", kind: "user", refreshable: true }),
    ctor: GitAuthExpiredError,
    fields: { operation: "readFile", kind: "user", refreshable: true },
  },
  {
    name: "GitNotFoundError",
    error: new GitNotFoundError({
      operation: "readFile",
      resource: "file",
      identifier: "spec/vision.md",
    }),
    ctor: GitNotFoundError,
    fields: { operation: "readFile", resource: "file", identifier: "spec/vision.md" },
  },
  {
    name: "GitConflictError",
    error: new GitConflictError({
      operation: "createBranch",
      reason: "exists",
      identifier: "feat/tk-38",
    }),
    ctor: GitConflictError,
    fields: { operation: "createBranch", reason: "exists", identifier: "feat/tk-38" },
  },
  {
    name: "GitRateLimitedError",
    error: new GitRateLimitedError({ operation: "writeCommit", retryAfterMs: 1500 }),
    ctor: GitRateLimitedError,
    fields: { operation: "writeCommit", retryAfterMs: 1500 },
  },
  {
    name: "GitProviderUnavailableError",
    error: new GitProviderUnavailableError({ operation: "listDeployments" }),
    ctor: GitProviderUnavailableError,
    fields: { operation: "listDeployments" },
  },
] as const;

describe.each(CASES)("CA6 $name", ({ name, error, ctor, fields }) => {
  it("fixe son nom", () => {
    expect(error.name).toBe(name);
  });
  it("est une Error, une GitProviderError et sa propre classe", () => {
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(GitProviderError);
    expect(error).toBeInstanceOf(ctor);
  });
  it("expose ses champs", () => {
    expect(error).toMatchObject(fields);
  });
  it("porte un message non vide", () => {
    expect(error.message.trim().length).toBeGreaterThan(0);
  });
  it("ne porte aucun jeton ni secret", () => {
    const own = Object.keys(error);
    expect(own.filter((key) => /token|secret|password|credential/i.test(key))).toEqual([]);
    expect(error.message).not.toMatch(/ghs_|ghu_|iat-|uat-/);
  });
});

describe("CA6 champs en lecture seule et cas particuliers", () => {
  it("les champs sont readonly pour le compilateur", () => {
    const forbidden = new RepoCreationForbiddenError({
      operation: "createRepo",
      owner,
      reason: "missing-user-token",
    });
    const mutate = () => {
      // @ts-expect-error champ readonly
      forbidden.reason = "resource-not-accessible";
      // @ts-expect-error champ readonly
      forbidden.owner = owner;
      // @ts-expect-error champ readonly
      forbidden.operation = "x";
    };
    expect(typeof mutate).toBe("function");
  });

  it("RepoCreationForbiddenError accepte les deux motifs et donne une piste d'action", () => {
    for (const reason of ["missing-user-token", "resource-not-accessible"] as const) {
      const error = new RepoCreationForbiddenError({ operation: "createRepo", owner, reason });
      expect(error.reason).toBe(reason);
      expect(error.message).toMatch(/GitHub/);
    }
  });

  it("GitRateLimitedError accepte une durée inconnue", () => {
    const error = new GitRateLimitedError({ operation: "writeCommit", retryAfterMs: undefined });
    expect(error.retryAfterMs).toBeUndefined();
  });

  it("GitProviderError est la racine commune et n'est pas une sous-classe de l'une d'elles", () => {
    const root = new GitProviderError("createRepo");
    expect(root).toBeInstanceOf(Error);
    expect(root.operation).toBe("createRepo");
    expect(root).not.toBeInstanceOf(UserTokenRequiredError);
  });
});

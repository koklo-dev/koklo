import {
  GitAuthExpiredError,
  GitConflictError,
  GitNotFoundError,
  GitProviderError,
  GitProviderUnavailableError,
  GitRateLimitedError,
  PROJECT_CREATION_ERROR_CODES,
  RepoCreationForbiddenError,
  UserTokenRequiredError,
} from "@koklo/domain";
import { InvalidRepoNameError, ProvisionError } from "@koklo/github";
import { describe, expect, it } from "vitest";
import { classifyCreationError } from "../src/project-creation/errors.ts";

/**
 * TK-93 lot A (cas 6) : projection des erreurs du port en codes d'échec de création (liste fermée),
 * et distinction transitoire (relance pg-boss) / définitif. Aucun message du fournisseur ne sort.
 */
const OWNER = { kind: "user", login: "marie" } as const;
const step = (name: ProvisionError["step"], cause: unknown) => new ProvisionError(name, cause);

const CASES: [string, unknown, Record<string, unknown>][] = [
  [
    "user_token_required",
    step("createRepo", new UserTokenRequiredError({ operation: "createRepo", owner: OWNER })),
    { code: "user_token_required", ownerLogin: "marie", transient: false },
  ],
  [
    "user_token_required (refus sans jeton utilisateur)",
    step(
      "createRepo",
      new RepoCreationForbiddenError({
        operation: "createRepo",
        owner: OWNER,
        reason: "missing-user-token",
      }),
    ),
    { code: "user_token_required", ownerLogin: "marie", transient: false },
  ],
  [
    "resource_not_accessible",
    step(
      "createRepo",
      new RepoCreationForbiddenError({
        operation: "createRepo",
        owner: OWNER,
        reason: "resource-not-accessible",
      }),
    ),
    { code: "resource_not_accessible", ownerLogin: "marie", transient: false },
  ],
  [
    "auth_expired_user",
    step(
      "authenticate",
      new GitAuthExpiredError({ operation: "authenticate", kind: "user", refreshable: false }),
    ),
    { code: "auth_expired_user", transient: false },
  ],
  [
    "auth_expired_installation",
    step(
      "authenticate",
      new GitAuthExpiredError({
        operation: "authenticate",
        kind: "installation",
        refreshable: true,
      }),
    ),
    { code: "auth_expired_installation", transient: false },
  ],
  [
    "rate_limited",
    step("createRepo", new GitRateLimitedError({ operation: "createRepo", retryAfterMs: 4000 })),
    { code: "rate_limited", retryAfterMs: 4000, transient: false },
  ],
  [
    "provider_unavailable",
    step("writeCommit", new GitProviderUnavailableError({ operation: "writeCommit" })),
    { code: "provider_unavailable", transient: true },
  ],
  [
    "name_taken",
    step(
      "createRepo",
      new GitConflictError({ operation: "createRepo", reason: "exists", identifier: "x" }),
    ),
    { code: "name_taken", transient: false },
  ],
  [
    "account_unavailable (installation introuvable)",
    step(
      "authenticate",
      new GitNotFoundError({
        operation: "authenticate",
        resource: "installation",
        identifier: "1",
      }),
    ),
    { code: "account_unavailable", transient: false },
  ],
  ["invalid_name", new InvalidRepoNameError(), { code: "invalid_name", transient: false }],
  [
    "forbidden (403 du fournisseur)",
    step("createRepo", new GitProviderError("createRepo", undefined, { status: 403 })),
    { code: "forbidden", transient: false },
  ],
  ["unknown (erreur inconnue)", new Error("boom"), { code: "unknown", transient: false }],
  [
    "unknown (conflit sur une étape qui n'est pas createRepo)",
    step(
      "createBranch",
      new GitConflictError({ operation: "createBranch", reason: "exists", identifier: "b" }),
    ),
    { code: "unknown", transient: false },
  ],
];

describe("TK-93 classifyCreationError", () => {
  it.each(CASES)("%s", (_label, error, expected) => {
    expect(classifyCreationError(error)).toMatchObject(expected);
  });

  it("tout code produit appartient à la liste fermée du domaine", () => {
    for (const [, error] of CASES) {
      expect(PROJECT_CREATION_ERROR_CODES).toContain(classifyCreationError(error).code);
    }
  });

  it("le résultat ne contient jamais le message de l'erreur du port", () => {
    const secret = "ghs_TOP_SECRET_VALUE_0123456789";
    const failure = classifyCreationError(step("createRepo", new Error(secret)));
    expect(JSON.stringify(failure)).not.toContain(secret);
  });
});

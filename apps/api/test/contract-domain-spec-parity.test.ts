/**
 * Parité du contrat 0.5.0 avec le domaine (TK-38/39), @koklo/schema (TK-40) et la base (TK-41).
 * Le contrat ne peut importer ni domain ni schema (`turbo boundaries`) : il porte des copies en dur
 * et ce test (placé dans l'api, qui voit le domaine) relit par chemin les sources de schema et de
 * db, comme `packages/db/test/spec-enum-parity.test.ts`.
 */
import * as contract from "@koklo/contract";
import * as domain from "@koklo/domain";
import { describe, expect, it } from "vitest";
import {
  accepts,
  api,
  errorMap,
  inputOf,
  kept,
  literals,
  options,
  prismaEnum,
  read,
  sorted,
} from "./helpers/parity.ts";

describe("D1 énumérations du dépôt : copie en dur, domaine, base", () => {
  it("REPO_ROLES = repoRoleSchema = enum Prisma RepoRole", () => {
    const hard = ["back", "front", "mobile", "monorepo", "spec"];
    expect(sorted(domain.REPO_ROLES)).toEqual(hard);
    expect(options(api.repoRoleSchema)).toEqual(hard);
    expect(prismaEnum("RepoRole")).toEqual(hard);
  });
  it("REPO_MODES = repoModeSchema = enum Prisma RepoMode", () => {
    expect(sorted(domain.REPO_MODES)).toEqual(["adopted", "new"]);
    expect(options(api.repoModeSchema)).toEqual(["adopted", "new"]);
    expect(prismaEnum("RepoMode")).toEqual(["adopted", "new"]);
  });
  it("statuts d'installation, d'index et de lot = enums Prisma", () => {
    expect(options(api.installationStatusSchema)).toEqual(prismaEnum("InstallationStatus"));
    expect(options(api.specIndexStatusSchema)).toEqual(prismaEnum("SpecIndexStatus"));
    expect(options(api.specBatchStatusSchema)).toEqual(prismaEnum("WriteBatchStatus"));
    expect(prismaEnum("InstallationStatus")).toEqual(["active", "deleted", "suspended"]);
    expect(prismaEnum("WriteBatchStatus")).toEqual([
      "committed",
      "committing",
      "conflict",
      "failed",
      "queued",
    ]);
  });
});

describe("D1b propriétaire, visibilité, webhooks", () => {
  it("propriétaire (organization | user) = GitOwner['kind'] = enum Prisma OwnerKind", () => {
    const owner: domain.GitOwner = { kind: "user", login: "yahse" };
    const item = {
      id: "123e4567-e89b-42d3-a456-426614174000",
      provider: "github",
      ownerKind: owner.kind,
      ownerLogin: owner.login,
      status: "active",
      userAuthorization: "absent",
      createdAt: "2026-11-04T10:00:00.000Z",
    };
    expect(prismaEnum("OwnerKind")).toEqual(["organization", "user"]);
    for (const kind of ["organization", "user"]) {
      expect(
        accepts(errorMap("repo.createSpec").REPO_CREATION_FORBIDDEN?.data, {
          reason: "missing-user-token",
          ownerLogin: "a",
          ownerKind: kind,
        }),
        kind,
      ).toBe(true);
      expect(accepts(api.installationSchema, { ...item, ownerKind: kind }), kind).toBe(true);
    }
    expect(accepts(api.installationSchema, { ...item, ownerKind: "team" })).toBe(false);
  });
  it("Visibility du domaine : jamais exposée par repo.createSpec (toujours private)", () => {
    const input = kept(inputOf("repo.createSpec"), {
      projectId: "123e4567-e89b-42d3-a456-426614174000",
      installationId: "223e4567-e89b-42d3-a456-426614174001",
      visibility: "public" satisfies domain.Visibility,
    });
    expect(input === undefined || !("visibility" in input)).toBe(true);
  });
  it("les événements de webhook du domaine ne sont pas exposés par le contrat", () => {
    expect(sorted(domain.WEBHOOK_EVENTS)).toEqual([
      "check_run",
      "check_suite",
      "deployment_status",
      "installation",
      "pull_request",
      "pull_request_review",
      "push",
      "workflow_run",
    ]);
    expect(Object.keys(api).filter((name) => /webhook/i.test(name))).toEqual([]);
    expect(Object.keys(contract.contract).filter((name) => /webhook/i.test(name))).toEqual([]);
  });
});

describe("D2 erreurs du port Git <-> erreurs typées du contrat", () => {
  const owner: domain.GitOwner = { kind: "organization", login: "koklo-hq" };
  it("la table de correspondance couvre chaque erreur du port Git", () => {
    const portErrors = [
      ...read("packages/domain/src/git-errors.ts").matchAll(/export class (\w+Error) extends/g),
    ].map((m) => m[1]);
    const MAPPED: Record<string, string | null> = {
      RepoCreationForbiddenError: "REPO_CREATION_FORBIDDEN",
      UserTokenRequiredError: "USER_TOKEN_REQUIRED",
      GitAuthExpiredError: "PROVIDER_AUTH_EXPIRED",
      GitNotFoundError: "NOT_FOUND",
      GitConflictError: "CONFLICT / SPEC_BATCH_CONFLICT",
      GitRateLimitedError: "PROVIDER_RATE_LIMITED",
      GitProviderUnavailableError: "PROVIDER_UNAVAILABLE",
      GitProviderError: "INTERNAL (racine abstraite)",
    };
    expect(sorted(portErrors as string[])).toEqual(sorted(Object.keys(MAPPED)));
    for (const name of Object.keys(MAPPED))
      expect(typeof (domain as Record<string, unknown>)[name], name).toBe("function");
  });
  it("REPO_CREATION_FORBIDDEN : mêmes reason que le domaine", () => {
    const source = read("packages/domain/src/git-errors.ts");
    const reasons = literals(/RepoCreationForbiddenReason =([^;]+);/.exec(source)?.[1] ?? "");
    expect(sorted(reasons)).toEqual(["missing-user-token", "resource-not-accessible"]);
    const data = errorMap("repo.createSpec").REPO_CREATION_FORBIDDEN?.data;
    for (const reason of reasons) {
      const error = new domain.RepoCreationForbiddenError({
        operation: "createRepo",
        owner,
        reason: reason as domain.RepoCreationForbiddenReason,
      });
      expect(
        accepts(data, {
          reason: error.reason,
          ownerLogin: error.owner.login,
          ownerKind: error.owner.kind,
        }),
        reason,
      ).toBe(true);
    }
    expect(
      accepts(data, { reason: "unknown", ownerLogin: owner.login, ownerKind: owner.kind }),
    ).toBe(false);
  });
});

describe("D2b erreurs du port Git <-> erreurs typées : suite", () => {
  const owner: domain.GitOwner = { kind: "organization", login: "koklo-hq" };
  it("USER_TOKEN_REQUIRED, PROVIDER_AUTH_EXPIRED, PROVIDER_RATE_LIMITED, PROVIDER_UNAVAILABLE", () => {
    const needed = new domain.UserTokenRequiredError({ operation: "createRepo", owner });
    expect(
      accepts(errorMap("repo.createSpec").USER_TOKEN_REQUIRED?.data, {
        ownerLogin: needed.owner.login,
      }),
    ).toBe(true);
    for (const kind of ["installation", "user"] as const) {
      const expired = new domain.GitAuthExpiredError({ operation: "x", kind, refreshable: true });
      expect(
        accepts(errorMap("specBatch.submit").PROVIDER_AUTH_EXPIRED?.data, {
          kind: expired.kind,
          refreshable: expired.refreshable,
        }),
        kind,
      ).toBe(true);
    }
    const limited = new domain.GitRateLimitedError({ operation: "x", retryAfterMs: 2000 });
    const unknownDelay = new domain.GitRateLimitedError({
      operation: "x",
      retryAfterMs: undefined,
    });
    const rate = errorMap("specBatch.submit").PROVIDER_RATE_LIMITED?.data;
    expect(accepts(rate, { retryAfterMs: limited.retryAfterMs })).toBe(true);
    expect(
      accepts(
        rate,
        unknownDelay.retryAfterMs === undefined ? {} : { retryAfterMs: unknownDelay.retryAfterMs },
      ),
    ).toBe(true);
    expect(errorMap("specBatch.submit").PROVIDER_UNAVAILABLE).toBeDefined();
  });
  it("GitConflictError : exists -> CONFLICT, stale-sha -> SPEC_BATCH_CONFLICT, not-mergeable -> aucun", () => {
    const reasons = literals(
      /GitConflictReason =([^;]+);/.exec(read("packages/domain/src/git-errors.ts"))?.[1] ?? "",
    );
    expect(sorted(reasons)).toEqual(["exists", "not-mergeable", "stale-sha"]);
    for (const name of ["repo.link", "repo.createSpec"]) {
      for (const reason of ["spec_repo_exists", "repo_already_linked", "repo_name_taken"]) {
        expect(accepts(errorMap(name).CONFLICT?.data, { reason }), `${name} ${reason}`).toBe(true);
      }
    }
    expect(
      accepts(errorMap("specBatch.submit").SPEC_BATCH_CONFLICT?.data, { reason: "stale_base" }),
    ).toBe(true);
  });
});

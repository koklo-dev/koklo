import { describe, expect, it } from "vitest";
import {
  canRetryCreation,
  isSettledCreation,
  PROJECT_CREATION_ERROR_CODES,
  PROJECT_CREATION_QUEUE,
  projectCreationSingletonKey,
} from "../src/index.ts";

describe("TK-93 règles de création de projet", () => {
  it("file `project-creation`, singleton par création", () => {
    expect(PROJECT_CREATION_QUEUE).toBe("project-creation");
    expect(projectCreationSingletonKey("abc")).toBe("abc");
  });

  it("les 12 codes d'échec de la fiche, sans autre", () => {
    expect([...PROJECT_CREATION_ERROR_CODES].sort()).toEqual(
      [
        "no_account",
        "name_taken",
        "user_token_required",
        "auth_expired_user",
        "auth_expired_installation",
        "resource_not_accessible",
        "provider_unavailable",
        "rate_limited",
        "account_unavailable",
        "invalid_name",
        "forbidden",
        "unknown",
      ].sort(),
    );
  });

  it("relance : seulement depuis failed ou skipped", () => {
    expect(canRetryCreation("failed")).toBe(true);
    expect(canRetryCreation("skipped")).toBe(true);
    expect(canRetryCreation("running")).toBe(false);
    expect(canRetryCreation("pending")).toBe(false);
    expect(canRetryCreation("succeeded")).toBe(false);
  });

  it("états réglés : succeeded, failed, skipped", () => {
    expect(["pending", "running"].map((s) => isSettledCreation(s as "pending"))).toEqual([
      false,
      false,
    ]);
    expect(isSettledCreation("succeeded")).toBe(true);
  });
});

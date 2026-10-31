import { RequestError } from "@octokit/request-error";
import { describe, expect, it } from "vitest";
import { mapGitHubError } from "../src/errors-map.ts";

const CANARY = "ghu_CANARY-s3cr3t";
const context = {
  operation: "getUserOwnerRole",
  credential: { kind: "user", refreshable: false },
  resource: "membership",
  identifier: "acme",
} as const;

const failure = (status: number, message: string, errors?: unknown[]) =>
  new RequestError(message, status, {
    request: { method: "GET", url: "https://api.github.com/user", headers: {} },
    response: {
      status,
      url: "https://api.github.com/user",
      headers: {},
      data: { message, ...(errors ? { errors } : {}) },
    },
  });
const map = (error: unknown) => mapGitHubError(error, context, () => new Date(0));

describe("denial d'un 403 : énumération fermée calculée dans l'adaptateur", () => {
  it.each([
    ["Resource not accessible by integration", "resource_not_accessible"],
    ["This GitHub App is blocked by the organization", "app_blocked"],
    ["Org has an access policy enabled", "access_policy"],
    ["third-party application access restricted", "access_policy"],
    ["Resource protected by organization SAML enforcement", "saml_enforcement"],
    ["You must have admin permission", "permission_missing"],
    ["Forbidden", "other"],
  ])("%s -> %s", (message, denial) => {
    const error = map(failure(403, message));
    expect(error).toMatchObject({ status: 403, denial });
    expect(Object.keys(error)).not.toContain("denial");
  });

  it("lit aussi les messages de validation", () => {
    expect(map(failure(403, "Forbidden", [{ message: "SAML required" }]))).toMatchObject({
      denial: "saml_enforcement",
    });
  });

  it("aucun denial hors 403", () => {
    for (const status of [404, 422, 500]) {
      expect(map(failure(status, "blocked saml permission"))).not.toHaveProperty("denial");
    }
  });

  it("aucun texte brut du message ne sort dans l'erreur", () => {
    const error = map(failure(403, `Resource not accessible by integration ${CANARY}`));
    const dump = JSON.stringify([error.message, error.denial, { ...error }, error.cause]);
    expect(error.denial).toBe("resource_not_accessible");
    expect(dump).not.toContain(CANARY);
    expect(
      String(Object.getOwnPropertyNames(error).map((k) => String(Reflect.get(error, k)))),
    ).not.toContain(CANARY);
  });
});

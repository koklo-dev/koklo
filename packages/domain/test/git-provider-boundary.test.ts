import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import * as domain from "../src/index.ts";

const root = resolve(import.meta.dirname, "..");
const srcDir = resolve(root, "src");
const OCTOKIT = /octokit/i;

describe("CA1 aucune dépendance à Octokit dans domain", () => {
  it("aucun fichier de src ne mentionne octokit ni @octokit/*", () => {
    const files = readdirSync(srcDir).filter((f) => f.endsWith(".ts"));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      expect(readFileSync(resolve(srcDir, file), "utf8"), file).not.toMatch(OCTOKIT);
    }
  });

  it("package.json ne référence pas octokit", () => {
    expect(readFileSync(resolve(root, "package.json"), "utf8")).not.toMatch(OCTOKIT);
  });

  it("le port est livré dans src (git-provider.ts)", () => {
    expect(readdirSync(srcDir)).toContain("git-provider.ts");
  });
});

describe("CA8 exports publics du port", () => {
  it("exporte les valeurs : WEBHOOK_EVENTS et les 8 erreurs", () => {
    for (const name of [
      "WEBHOOK_EVENTS",
      "GitProviderError",
      "RepoCreationForbiddenError",
      "UserTokenRequiredError",
      "GitAuthExpiredError",
      "GitNotFoundError",
      "GitConflictError",
      "GitRateLimitedError",
      "GitProviderUnavailableError",
    ]) {
      expect(domain, name).toHaveProperty(name);
    }
  });
});

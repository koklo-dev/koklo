import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Hotfix HOTFIX-github-app-config : les identifiants client de la GitHub App sont des secrets
 * d'infra facultatifs (`GH_APP_CLIENT_*`), mappés vers `GITHUB_APP_CLIENT_*` pour l'API seule.
 * Ils ne sont jamais confondus avec l'OAuth App de connexion (`OAUTH_GITHUB_CLIENT_*`).
 * Analyse textuelle : le dépôt n'embarque pas de lecteur YAML et le schéma fait foi côté infra
 * (`pnpm deploy:check`).
 */
const manifest = readFileSync(
  resolve(import.meta.dirname, "../../../.deploy/manifest.yaml"),
  "utf8",
);

/** `NOM: '${secrets.SECRET}'`, tel qu'écrit dans le manifest. */
const mapping = (name: string, secret: string): string => `${name}: '\${secrets.${secret}}'`;

const listOf = (key: string): string[] => {
  const match = manifest.match(new RegExp(`^${key}:\\s*\\[([^\\]]*)\\]`, "m"));
  return (match?.[1] ?? "").split(",").map((item) => item.trim());
};
const block = (name: string): string =>
  manifest.match(new RegExp(`^ {2}${name}:[\\s\\S]*?(?=^ {2}\\S|^\\S)`, "m"))?.[0] ?? "";

describe("manifest : identifiants client de la GitHub App", () => {
  it("GH_APP_CLIENT_ID et GH_APP_CLIENT_SECRET sont optionnels, jamais obligatoires", () => {
    expect(listOf("optionalSecrets")).toEqual(
      expect.arrayContaining(["GH_APP_CLIENT_ID", "GH_APP_CLIENT_SECRET"]),
    );
    expect(listOf("secrets")).not.toContain("GH_APP_CLIENT_ID");
    expect(listOf("secrets")).not.toContain("GH_APP_CLIENT_SECRET");
  });

  it("l'API les reçoit sous GITHUB_APP_CLIENT_ID / GITHUB_APP_CLIENT_SECRET", () => {
    const api = block("api");
    expect(api).toContain(mapping("GITHUB_APP_CLIENT_ID", "GH_APP_CLIENT_ID"));
    expect(api).toContain(mapping("GITHUB_APP_CLIENT_SECRET", "GH_APP_CLIENT_SECRET"));
  });

  it("le worker ne les reçoit pas", () => {
    expect(block("worker")).not.toContain("CLIENT");
  });

  it("l'OAuth de connexion reste sur ses propres secrets", () => {
    const api = block("api");
    expect(api).toContain(mapping("GITHUB_CLIENT_ID", "OAUTH_GITHUB_CLIENT_ID"));
    expect(api).toContain(mapping("GITHUB_CLIENT_SECRET", "OAUTH_GITHUB_CLIENT_SECRET"));
  });
});

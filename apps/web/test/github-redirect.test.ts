import { describe, expect, it } from "vitest";
import { isGithubUrl } from "../src/lib/github-redirect.ts";

/** AC-48-15 : le web ne navigue que vers https://github.com, l'URL vient toujours de l'API. */
describe("isGithubUrl", () => {
  it.each([
    "https://github.com/apps/koklo/installations/new?state=abc.def",
    "https://github.com/login/oauth/authorize?client_id=Iv1.x&state=abc",
  ])("accepte %s", (url) => {
    expect(isGithubUrl(url)).toBe(true);
  });

  it.each([
    ["http au lieu de https", "http://github.com/apps/koklo/installations/new"],
    ["autre hôte", "https://evil.example/apps/koklo/installations/new"],
    ["sous-domaine", "https://api.github.com/apps/koklo"],
    ["hôte déguisé par le préfixe", "https://github.com.evil.example/apps/koklo"],
    ["hôte déguisé par identifiants", "https://github.com@evil.example/apps/koklo"],
    ["identifiants avant le bon hôte", "https://user:pass@github.com/apps/koklo"],
    ["javascript:", "javascript:alert(1)"],
    ["data:", "data:text/html,<script>alert(1)</script>"],
    ["URL relative", "/github?result=installed"],
    ["protocole relatif", "//github.com/apps/koklo"],
    ["chaîne vide", ""],
    ["port non standard", "https://github.com:8443/apps/koklo"],
  ])("refuse : %s", (_label, url) => {
    expect(isGithubUrl(url)).toBe(false);
  });
});

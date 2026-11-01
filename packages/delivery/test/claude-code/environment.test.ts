import { describe, expect, it } from "vitest";
import { buildChildEnv, CLAUDE_ENV_ALLOWLIST } from "../../src/claude-code/index.ts";
import { agentCredential } from "../../src/index.ts";
import { makeRequest, SECRET_KEY } from "../agent-helpers.ts";
import { makeRuntime, makeSandbox, PARENT_ENV, recordedEnv, script } from "./support.ts";

describe("buildChildEnv : liste blanche", () => {
  it("ne laisse passer que la liste blanche (PATH, HOME, LANG...)", () => {
    const env = buildChildEnv(PARENT_ENV, {});
    expect(Object.keys(env).every((key) => CLAUDE_ENV_ALLOWLIST.includes(key))).toBe(true);
    expect(env.PATH).toBe(PARENT_ENV.PATH);
    expect(env.HOME).toBe("/home/fake-runner");
    expect(env.LANG).toBe("fr_FR.UTF-8");
  });

  it("n'inclut aucun secret ni variable inconnue du parent", () => {
    const env = buildChildEnv(PARENT_ENV, {});
    for (const name of [
      "GITHUB_TOKEN",
      "DATABASE_URL",
      "KOKLO_BYOK_KEY",
      "ANTHROPIC_API_KEY",
      "CLAUDE_CODE_USE_BEDROCK",
      "UNKNOWN_VARIABLE",
    ]) {
      expect(env, name).not.toHaveProperty(name);
    }
    expect(JSON.stringify(env)).not.toContain("PARENT");
  });

  it("n'injecte la cle opaque que par ANTHROPIC_API_KEY, jamais celle du parent", () => {
    const env = buildChildEnv(PARENT_ENV, { credential: agentCredential(SECRET_KEY) });
    expect(env.ANTHROPIC_API_KEY).toBe(SECRET_KEY);
  });

  it("sans cle opaque, HOME herite permet le login d'abonnement (D7)", () => {
    expect(buildChildEnv(PARENT_ENV, {})).not.toHaveProperty("ANTHROPIC_API_KEY");
  });

  it("fusionne les variables explicites de l'appelant en dernier", () => {
    const env = buildChildEnv(PARENT_ENV, { extraEnv: { FAKE_CLAUDE_DIR: "/tmp/x" } });
    expect(env.FAKE_CLAUDE_DIR).toBe("/tmp/x");
  });

  it("ne mute pas l'environnement parent et gere un parent vide", () => {
    const parent = { ...PARENT_ENV };
    buildChildEnv(parent, {});
    expect(parent).toEqual(PARENT_ENV);
    expect(buildChildEnv({}, {})).toEqual({});
  });
});

describe("environnement reellement vu par le faux executable", () => {
  it("n'expose aucun secret du parent ni variable inconnue", async () => {
    const sandbox = makeSandbox();
    script(sandbox, { scenario: "completed" });
    await makeRuntime(sandbox).launchSession(
      makeRequest({ worktree: sandbox.worktree, credential: undefined }),
    );
    const seen = recordedEnv(sandbox);
    expect(seen).not.toHaveProperty("GITHUB_TOKEN");
    expect(seen).not.toHaveProperty("DATABASE_URL");
    expect(seen).not.toHaveProperty("KOKLO_BYOK_KEY");
    expect(seen).not.toHaveProperty("ANTHROPIC_API_KEY");
    expect(seen).not.toHaveProperty("UNKNOWN_VARIABLE");
    expect(JSON.stringify(seen)).not.toContain("PARENT");
    expect(seen.HOME).toBe("/home/fake-runner");
  });

  it("transmet la cle opaque uniquement dans l'environnement du fils", async () => {
    const sandbox = makeSandbox();
    script(sandbox, { scenario: "completed" });
    await makeRuntime(sandbox).launchSession(makeRequest({ worktree: sandbox.worktree }));
    expect(recordedEnv(sandbox).ANTHROPIC_API_KEY).toBe(SECRET_KEY);
  });
});

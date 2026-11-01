/** Validation de la configuration a la construction de l'adaptateur (executable, PATH, racines, env). */
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildChildEnv, ClaudeCodeRuntime } from "../../src/claude-code/index.ts";
import { AgentRuntimeUnavailableError } from "../../src/index.ts";
import { FAKE_CLAUDE, PARENT_ENV } from "./support.ts";

const build = (overrides: Record<string, unknown> = {}) =>
  new ClaudeCodeRuntime({
    executable: FAKE_CLAUDE,
    allowedRoots: ["/srv/koklo/worktrees"],
    parentEnv: PARENT_ENV,
    ...overrides,
  } as ConstructorParameters<typeof ClaudeCodeRuntime>[0]);

describe("executable", () => {
  it.each(["claude", FAKE_CLAUDE, undefined])("accepte %s", (executable) => {
    expect(() => build({ executable })).not.toThrow();
  });

  it.each([
    "./claude",
    "../bin/claude",
    "bin/claude",
    "node_modules/.bin/claude",
    "other",
    "",
    "a\0b",
  ])("refuse l'executable relatif ou inattendu %j", (executable) => {
    expect(() => build({ executable })).toThrow(AgentRuntimeUnavailableError);
  });

  it.each([".", "bin", "", "/usr/bin::/bin", "/usr/bin:./node_modules/.bin"])(
    "refuse un PATH avec une entree relative ou vide (%j) quand l'executable est `claude`",
    (path) => {
      expect(() => build({ executable: "claude", parentEnv: { PATH: path } })).toThrow(
        AgentRuntimeUnavailableError,
      );
    },
  );

  it("accepte un PATH absolu, ou n'importe quel PATH avec un executable absolu", () => {
    expect(() =>
      build({ executable: "claude", parentEnv: { PATH: "/usr/bin:/bin" } }),
    ).not.toThrow();
    expect(() => build({ executable: FAKE_CLAUDE, parentEnv: { PATH: "." } })).not.toThrow();
    expect(() => build({ executable: "claude", parentEnv: {} })).not.toThrow();
  });
});

describe("allowedRoots", () => {
  it.each([
    ["la racine du disque", ["/"]],
    ["un chemin relatif", ["worktrees"]],
    ["un segment ..", ["/srv/../etc"]],
    ["un chemin vide", [""]],
    ["un octet NUL", ["/srv/a\0b"]],
    ["une valeur qui n'est pas une chaine", [42]],
    ["une liste absente", undefined],
  ])("refuse %s", (_label, allowedRoots) => {
    expect(() => build({ allowedRoots })).toThrow(AgentRuntimeUnavailableError);
  });

  it("accepte des racines absolues, y compris une liste vide (tout est alors refuse)", () => {
    expect(() => build({ allowedRoots: ["/srv/a", join("/", "tmp", "b")] })).not.toThrow();
    expect(() => build({ allowedRoots: [] })).not.toThrow();
  });
});

describe("extraEnv", () => {
  const FORBIDDEN = [
    "LD_PRELOAD",
    "LD_LIBRARY_PATH",
    "DYLD_INSERT_LIBRARIES",
    "NODE_OPTIONS",
    "PATH",
    "HOME",
    "ANTHROPIC_API_KEY",
    "ANTHROPIC_BASE_URL",
    "ANTHROPIC_AUTH_TOKEN",
  ];

  it.each(FORBIDDEN)("refuse %s a la construction", (name) => {
    expect(() => build({ extraEnv: { [name]: "x" } })).toThrow(AgentRuntimeUnavailableError);
  });

  it("n'applique jamais ces noms dans l'environnement du fils, meme appeles directement", () => {
    const env = buildChildEnv(PARENT_ENV, {
      extraEnv: { LD_PRELOAD: "/evil.so", NODE_OPTIONS: "--require x", PATH: "/evil", OK_VAR: "1" },
    });
    expect(env).not.toHaveProperty("LD_PRELOAD");
    expect(env).not.toHaveProperty("NODE_OPTIONS");
    expect(env.PATH).toBe(PARENT_ENV.PATH);
    expect(env.OK_VAR).toBe("1");
  });

  it("accepte des variables ordinaires", () => {
    expect(() =>
      build({ extraEnv: { FAKE_CLAUDE_DIR: "/tmp/x", KOKLO_TRACE: "1" } }),
    ).not.toThrow();
  });
});

import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { missingRealEnv, REAL_ENV_VARIABLES } from "../scripts/real-env.ts";
import ciConfig from "../vitest.config.ts";
import realConfig from "../vitest.real.config.ts";

const pkgDir = resolve(import.meta.dirname, "..");

const full = (): Record<string, string> => ({
  KOKLO_GH_APP_ID: "1",
  KOKLO_GH_PRIVATE_KEY: "pem",
  KOKLO_GH_CLIENT_ID: "c",
  KOKLO_GH_CLIENT_SECRET: "s",
  KOKLO_GH_ORG_LOGIN: "o",
  KOKLO_GH_ORG_INSTALLATION_ID: "2",
  KOKLO_GH_USER_LOGIN: "u",
  KOKLO_GH_USER_INSTALLATION_ID: "3",
  KOKLO_GH_USER_TOKEN: "t",
  KOKLO_GH_USER_TOKEN_EXPIRES_AT: "2099-01-01T00:00:00.000Z",
});

describe("CA10 garde du script test:real", () => {
  it("missingRealEnv liste toutes les variables absentes", () => {
    expect(missingRealEnv({})).toEqual(
      expect.arrayContaining(REAL_ENV_VARIABLES.filter((v) => v !== "KOKLO_GH_PRIVATE_KEY")),
    );
    expect(missingRealEnv({}).some((v) => v.includes("KOKLO_GH_PRIVATE_KEY"))).toBe(true);
    expect(missingRealEnv(full())).toEqual([]);
  });

  it("une variable vide ou faite d'espaces compte comme manquante", () => {
    expect(missingRealEnv({ ...full(), KOKLO_GH_USER_TOKEN: "  " })).toEqual([
      "KOKLO_GH_USER_TOKEN",
    ]);
  });

  it("la clé privée peut venir d'un chemin (KOKLO_GH_PRIVATE_KEY_PATH)", () => {
    const { KOKLO_GH_PRIVATE_KEY: _drop, ...rest } = full();
    expect(missingRealEnv(rest).some((v) => v.includes("KOKLO_GH_PRIVATE_KEY"))).toBe(true);
    expect(missingRealEnv({ ...rest, KOKLO_GH_PRIVATE_KEY_PATH: "/tmp/key.pem" })).toEqual([]);
  });

  it("pnpm test:real sans variables : code de sortie non nul et liste des variables manquantes", () => {
    const env = Object.fromEntries(
      Object.entries(process.env).filter(([k]) => !k.startsWith("KOKLO_GH_")),
    );
    const run = spawnSync("node", ["scripts/run-real.ts"], { cwd: pkgDir, env, encoding: "utf8" });
    expect(run.status).not.toBe(0);
    expect(run.status).not.toBeNull();
    for (const name of ["KOKLO_GH_APP_ID", "KOKLO_GH_USER_TOKEN", "KOKLO_GH_ORG_LOGIN"]) {
      expect(run.stderr, name).toContain(name);
    }
    expect(`${run.stdout}${run.stderr}`).not.toMatch(/skipped|passed/i);
  });

  it("une seule variable manquante suffit à échouer et seule celle-là est citée", () => {
    const { KOKLO_GH_ORG_LOGIN: _drop, ...rest } = full();
    const run = spawnSync("node", ["scripts/run-real.ts"], {
      cwd: pkgDir,
      env: { PATH: process.env.PATH ?? "", ...rest },
      encoding: "utf8",
    });
    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain("KOKLO_GH_ORG_LOGIN");
    expect(run.stderr).not.toContain("KOKLO_GH_APP_ID");
  });
});

describe("CA10 les tests réels ne sont jamais collectés par la CI", () => {
  const include = (config: unknown): string[] =>
    (config as { test?: { include?: string[] } }).test?.include ?? [];

  it("vitest.config.ts (CI) ne collecte que des *.test.ts", () => {
    const patterns = include(ciConfig);
    expect(patterns.length).toBeGreaterThan(0);
    for (const pattern of patterns) {
      expect(pattern).toMatch(/\.test\.ts$/);
      expect(pattern).not.toMatch(/real/);
    }
  });

  it("vitest.real.config.ts ne collecte que test/real/**/*.real.ts", () => {
    expect(include(realConfig)).toEqual(["test/real/**/*.real.ts"]);
  });

  it("aucun fichier *.real.ts n'est nommé *.test.ts et tous vivent dans test/real", () => {
    const real = readdirSync(resolve(pkgDir, "test/real"));
    expect(real).toContain("github.real.ts");
    for (const file of real) expect(file).not.toMatch(/\.test\.ts$/);
  });

  it("le script test:real utilise la config réelle et le script test ne l'appelle pas", () => {
    const pkg = JSON.parse(readFileSync(resolve(pkgDir, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts["test:real"]).toContain("run-real.ts");
    expect(pkg.scripts.test).not.toMatch(/real/);
    const runner = readFileSync(resolve(pkgDir, "scripts/run-real.ts"), "utf8");
    expect(runner).toContain("vitest.real.config.ts");
    expect(runner).toContain("missingRealEnv");
  });

  it("turbo : la tâche test:real est sans cache et hors de la tâche test", () => {
    const turbo = JSON.parse(readFileSync(resolve(pkgDir, "turbo.json"), "utf8")) as {
      tasks: Record<string, { cache?: boolean; passThroughEnv?: string[] }>;
    };
    expect(turbo.tasks["test:real"]?.cache).toBe(false);
    expect(turbo.tasks["test:real"]?.passThroughEnv).toContain("KOKLO_GH_APP_ID");
  });
});

import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.ts";

/**
 * TK-44b §5.2 : configuration `GITHUB_APP_*` du worker (mêmes règles tout-ou-rien que l'API),
 * dépendances db/domain/github/schema du worker et frontières turbo. Tests statiques, sans Docker.
 */
const PEM = "-----BEGIN PRIVATE KEY-----\nABCDEF\n-----END PRIVATE KEY-----\n";
const BASE = { DATABASE_URL: "postgresql://u:p@h:5432/d" };

describe("config GITHUB_APP_* du worker", () => {
  it("aucune variable : pas d'App (githubApp absent), le worker démarre quand même", () => {
    expect(loadConfig(BASE).githubApp).toBeUndefined();
  });

  it("ID + clé : App configurée, clé base64 décodée en PEM, clients absents", () => {
    const config = loadConfig({
      ...BASE,
      GITHUB_APP_ID: "123456",
      GITHUB_APP_PRIVATE_KEY: Buffer.from(PEM).toString("base64"),
    });
    expect(config.githubApp).toEqual({ appId: "123456", privateKey: PEM });
  });

  it("PEM aux \\n littéraux : décodé ; PEM multi-lignes : inchangé", () => {
    for (const value of [PEM.replaceAll("\n", "\\n"), PEM]) {
      const config = loadConfig({ ...BASE, GITHUB_APP_ID: "1", GITHUB_APP_PRIVATE_KEY: value });
      expect(config.githubApp?.privateKey).toBe(PEM);
    }
  });

  it("identifiants client facultatifs mais en paire", () => {
    const config = loadConfig({
      ...BASE,
      GITHUB_APP_ID: "1",
      GITHUB_APP_PRIVATE_KEY: PEM,
      GITHUB_APP_CLIENT_ID: "Iv1.x",
      GITHUB_APP_CLIENT_SECRET: "client-secret",
    });
    expect(config.githubApp).toMatchObject({ clientId: "Iv1.x", clientSecret: "client-secret" });
  });
});

describe("config GITHUB_APP_* du worker (suite 2)", () => {
  it.each([
    [{ GITHUB_APP_ID: "123456" }, "GITHUB_APP_PRIVATE_KEY", "123456"],
    [{ GITHUB_APP_PRIVATE_KEY: "cle-secrete-xyz" }, "GITHUB_APP_ID", "cle-secrete-xyz"],
    [
      { GITHUB_APP_CLIENT_ID: "Iv1.x", GITHUB_APP_CLIENT_SECRET: "sec-client" },
      "GITHUB_APP_ID",
      "sec-client",
    ],
    [
      { GITHUB_APP_ID: "1", GITHUB_APP_PRIVATE_KEY: PEM, GITHUB_APP_CLIENT_ID: "Iv1.seul" },
      "GITHUB_APP_CLIENT_SECRET",
      "Iv1.seul",
    ],
  ])(
    "configuration partielle %j : échec nommant la variable manquante, sans valeur",
    (env, missing, secret) => {
      let message = "";
      try {
        loadConfig({ ...BASE, ...env });
      } catch (error) {
        message = (error as Error).message;
      }
      expect(message).toContain(missing);
      expect(message).not.toContain(secret);
      expect(message).not.toContain("BEGIN PRIVATE KEY");
    },
  );

  it("valeurs vides = non fournies", () => {
    expect(
      loadConfig({ ...BASE, GITHUB_APP_ID: "", GITHUB_APP_PRIVATE_KEY: "" }).githubApp,
    ).toBeUndefined();
  });
});

const root = resolve(import.meta.dirname, "../../..");
const worker = resolve(import.meta.dirname, "..");

describe("dépendances et frontières du worker", () => {
  const manifest = JSON.parse(readFileSync(join(worker, "package.json"), "utf8")) as {
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
  };

  it.each(["@koklo/db", "@koklo/domain", "@koklo/github", "@koklo/schema"])(
    "%s est une dépendance de production du workspace",
    (name) => {
      expect(manifest.dependencies[name]).toBe("workspace:*");
    },
  );

  it("pg (client des tests d'intégration) est une dépendance de développement épinglée", () => {
    expect(manifest.devDependencies.pg).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("le tag turbo `worker` n'interdit que cli, ui et web : db, domain, github et schema restent permis", () => {
    const turbo = JSON.parse(readFileSync(join(root, "turbo.json"), "utf8")) as {
      boundaries: {
        tags: Record<string, { dependencies?: { deny?: string[]; allow?: string[] } }>;
      };
    };
    const rules = turbo.boundaries.tags.worker?.dependencies;
    expect([...(rules?.deny ?? [])].sort()).toEqual(["cli", "ui", "web"]);
    expect(rules?.allow).toBeUndefined();
  });

  it("le code de production du worker n'importe jamais le faux (@koklo/github/testing) ni l'API", () => {
    const sources = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) return sources(path);
        return path.endsWith(".ts") && !path.endsWith(".test.ts") ? [path] : [];
      });
    const offenders = sources(join(worker, "src")).filter((file) =>
      /@koklo\/github\/testing|@koklo\/api|apps\/api/.test(readFileSync(file, "utf8")),
    );
    expect(offenders).toEqual([]);
  });

  it("le job spec-write existe et la file porte le nom contractuel", async () => {
    const queue = await import("../src/jobs/spec-write.ts");
    expect(queue.SPEC_WRITE_QUEUE).toBe("spec-write");
    expect(queue.specWriteSingletonKey("repo-1", "cadrage")).toBe("repo-1:cadrage");
  });
});

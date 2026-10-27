import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.ts";

const envExample = readFileSync(resolve(import.meta.dirname, "..", ".env.example"), "utf8");

const exampleKeys = envExample
  .split("\n")
  .filter((line) => /^[A-Z_]+=/.test(line))
  .map((line) => line.split("=")[0] as string);

/** Enregistre chaque variable que le code lit réellement. */
function readKeys(): string[] {
  const read = new Set<string>();
  const env = new Proxy({ DATABASE_URL: "postgresql://u:p@h:5432/d" } as Record<string, string>, {
    get(target, key) {
      if (typeof key === "string") read.add(key);
      return target[key as string];
    },
  });
  loadConfig(env);
  return [...read].sort();
}

describe("configuration (C3.3)", () => {
  it(".env.example contient exactement les variables lues par le code", () => {
    expect(readKeys()).toEqual([...exampleKeys].sort());
    expect([...exampleKeys].sort()).toEqual(["APP_ENV", "APP_VERSION", "DATABASE_URL", "PORT"]);
  });

  it(".env.example ne contient aucun secret : mot de passe de dev local uniquement", () => {
    expect(envExample).not.toMatch(/(secret|token|api[_-]?key)=\S+/i);
  });

  it("lit les valeurs fournies et applique les défauts (PORT 3000, version dev)", () => {
    expect(loadConfig({ DATABASE_URL: "postgresql://u:p@h:5432/d" })).toMatchObject({
      databaseUrl: "postgresql://u:p@h:5432/d",
      port: 3000,
      appVersion: "dev",
    });
    expect(
      loadConfig({ DATABASE_URL: "postgresql://u:p@h:5432/d", PORT: "8080", APP_VERSION: "2.0.1" }),
    ).toMatchObject({ port: 8080, appVersion: "2.0.1" });
  });

  it("DATABASE_URL manquante : échec clair au démarrage", () => {
    expect(() => loadConfig({})).toThrow(/DATABASE_URL/);
  });
});

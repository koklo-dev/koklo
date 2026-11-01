import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.ts";

/**
 * TK-54b, D8 : plafonds des appels IA réglables par l'environnement. Absents : `config.ai` n'existe
 * pas et les défauts de `AI_LIMIT_DEFAULTS` s'appliquent (30 par organisation et par heure, 10 par
 * utilisateur, 5 verify, 2 appels simultanés). Valeur invalide : échec au démarrage qui nomme la
 * variable sans citer la valeur.
 */
const ENV = {
  DATABASE_URL: "postgresql://u:p@h:5432/d",
  BETTER_AUTH_SECRET: "s".repeat(40),
  BETTER_AUTH_URL: "http://localhost:3000",
  GITHUB_CLIENT_ID: "id",
  GITHUB_CLIENT_SECRET: "secret",
};
const VARIABLES = {
  AI_MAX_CALLS_PER_HOUR_ORG: "maxCallsPerHourOrg",
  AI_MAX_CALLS_PER_HOUR_USER: "maxCallsPerHourUser",
  AI_MAX_VERIFY_PER_HOUR_ORG: "maxVerifyPerHourOrg",
  AI_MAX_CONCURRENT_PER_ORG: "maxConcurrentPerOrg",
} as const;

describe("AI_MAX_* : plafonds des appels IA", () => {
  it("absents : aucune clé ai dans la configuration (les défauts du code s'appliquent)", () => {
    expect(loadConfig(ENV)).not.toHaveProperty("ai");
  });

  it.each(Object.entries(VARIABLES))("%s est lue en entier dans ai.%s", (variable, key) => {
    const config = loadConfig({ ...ENV, [variable]: "7" });
    expect(config.ai).toEqual({ [key]: 7 });
  });

  it("les quatre ensemble", () => {
    const config = loadConfig({
      ...ENV,
      AI_MAX_CALLS_PER_HOUR_ORG: "40",
      AI_MAX_CALLS_PER_HOUR_USER: "12",
      AI_MAX_VERIFY_PER_HOUR_ORG: "6",
      AI_MAX_CONCURRENT_PER_ORG: "3",
    });
    expect(config.ai).toEqual({
      maxCallsPerHourOrg: 40,
      maxCallsPerHourUser: 12,
      maxVerifyPerHourOrg: 6,
      maxConcurrentPerOrg: 3,
    });
  });

  it("une valeur vide équivaut à une valeur absente", () => {
    expect(loadConfig({ ...ENV, AI_MAX_CALLS_PER_HOUR_ORG: "" })).not.toHaveProperty("ai");
  });

  it.each(
    Object.keys(VARIABLES).flatMap((variable) =>
      ["abc", "0", "-3", "1.5", "100001"].map((value) => [variable, value]),
    ),
  )("%s = %j : échec nommant la variable, sans citer la valeur", (variable, value) => {
    let message = "";
    try {
      loadConfig({ ...ENV, [variable as string]: value });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain(variable);
    if ((value as string).length > 3) expect(message).not.toContain(value as string);
  });
});

describe(".env.example", () => {
  it("documente les quatre plafonds, sans valeur, avec leur défaut", () => {
    const example = readFileSync(resolve(import.meta.dirname, "..", ".env.example"), "utf8");
    for (const [variable, fallback] of [
      ["AI_MAX_CALLS_PER_HOUR_ORG", "30"],
      ["AI_MAX_CALLS_PER_HOUR_USER", "10"],
      ["AI_MAX_VERIFY_PER_HOUR_ORG", "5"],
      ["AI_MAX_CONCURRENT_PER_ORG", "2"],
    ]) {
      expect(example, variable).toMatch(new RegExp(`^${variable}=$`, "m"));
      expect(example).toMatch(
        new RegExp(`\\b${fallback}\\b[^\\n]*\\n(?:#[^\\n]*\\n)*${variable}=`),
      );
    }
  });
});

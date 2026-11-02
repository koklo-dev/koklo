import { describe, expect, it } from "vitest";
import { assertSafeEnvironment } from "../src/startup-guard.ts";

/**
 * TK-55 N6 : `APP_ENV=test` active la session de test (`x-test-session`, rôle fourni par l'en-tête).
 * Une API en `NODE_ENV=production` refuse de démarrer avec ce réglage.
 */
describe("garde-fou de démarrage", () => {
  it("APP_ENV=test avec NODE_ENV=production : refus qui nomme les variables, sans valeur", () => {
    const attempt = () =>
      assertSafeEnvironment({
        NODE_ENV: "production",
        APP_ENV: "test",
        BETTER_AUTH_SECRET: "s3cr3t-valeur",
      });
    expect(attempt).toThrow(/APP_ENV/);
    expect(attempt).toThrow(/NODE_ENV/);
    expect(attempt).not.toThrow(/s3cr3t-valeur/);
  });

  it.each(["Production", "PRODUCTION", "production ", " production", "\tProduction\n"])(
    "NODE_ENV=%j avec APP_ENV=test : refus (valeur normalisée)",
    (nodeEnv) => {
      expect(() => assertSafeEnvironment({ NODE_ENV: nodeEnv, APP_ENV: "test" })).toThrow(
        /NODE_ENV/,
      );
    },
  );

  it("APP_ENV=test normalisé aussi : refus avec NODE_ENV=production", () => {
    expect(() => assertSafeEnvironment({ NODE_ENV: "production", APP_ENV: " Test " })).toThrow(
      /APP_ENV/,
    );
  });

  it.each([
    ["production", "production"],
    ["production", "staging"],
    ["production", undefined],
    ["development", "test"],
    ["test", "test"],
    [undefined, "test"],
  ])("NODE_ENV=%s APP_ENV=%s : démarrage permis", (nodeEnv, appEnv) => {
    expect(() => assertSafeEnvironment({ NODE_ENV: nodeEnv, APP_ENV: appEnv })).not.toThrow();
  });
});

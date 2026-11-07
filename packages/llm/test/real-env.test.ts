import { describe, expect, it } from "vitest";
import { missingRealEnv, REAL_ENV, realConfigOf } from "../scripts/real-env.ts";

describe("test:real (mode manuel) : variables d'environnement", () => {
  it("refuse de démarrer sans configuration", () => {
    expect(missingRealEnv({})).toHaveLength(3);
  });
  it("refuse un fournisseur inconnu", () => {
    expect(
      missingRealEnv({ [REAL_ENV.provider]: "autre", [REAL_ENV.key]: "k", [REAL_ENV.model]: "m" }),
    ).toHaveLength(1);
  });
  it("openai_compatible exige l'adresse de base", () => {
    const env = {
      [REAL_ENV.provider]: "openai_compatible",
      [REAL_ENV.key]: "k",
      [REAL_ENV.model]: "m",
    };
    expect(missingRealEnv(env)).toEqual([REAL_ENV.baseUrl]);
    expect(realConfigOf({ ...env, [REAL_ENV.baseUrl]: "https://x.test/v1" }).baseUrl).toBe(
      "https://x.test/v1",
    );
  });
  it("accepte une configuration complète, sans adresse de base pour les autres", () => {
    const env = { [REAL_ENV.provider]: "anthropic", [REAL_ENV.key]: "k", [REAL_ENV.model]: "m" };
    expect(missingRealEnv(env)).toEqual([]);
    expect(realConfigOf(env)).toEqual({ provider: "anthropic", key: "k", model: "m" });
  });
});

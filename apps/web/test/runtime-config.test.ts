import { describe, expect, it } from "vitest";
import { readRuntimeConfig } from "../src/lib/runtime-config.ts";

const valid = { API_INTERNAL_URL: "http://api:3000", APP_ENV: "production", APP_VERSION: "1.2.3" };

describe("readRuntimeConfig", () => {
  it("lit l'URL de l'API et les métadonnées depuis l'environnement d'exécution", () => {
    expect(readRuntimeConfig(valid)).toEqual({
      apiUrl: "http://api:3000",
      appEnv: "production",
      appVersion: "1.2.3",
    });
  });

  it("suit la variable d'environnement sans rebuild : une autre API_INTERNAL_URL change l'URL cible", () => {
    const first = readRuntimeConfig(valid);
    const second = readRuntimeConfig({ ...valid, API_INTERNAL_URL: "http://other:4000" });
    expect(first.apiUrl).not.toBe(second.apiUrl);
    expect(second.apiUrl).toBe("http://other:4000");
  });

  it("n'utilise pas NEXT_PUBLIC_API_URL même si elle est définie", () => {
    const config = readRuntimeConfig({ ...valid, NEXT_PUBLIC_API_URL: "http://leak:1" });
    expect(config.apiUrl).toBe("http://api:3000");
  });

  it("échoue en nommant la variable manquante, sans exposer de valeur", () => {
    const { API_INTERNAL_URL: _omitted, ...withoutApi } = valid;
    expect(() => readRuntimeConfig(withoutApi)).toThrowError(/API_INTERNAL_URL/);
  });

  it("refuse une API_INTERNAL_URL qui n'est pas une URL, sans recopier sa valeur", () => {
    const secret = "pas-une-url-secret";
    let message = "";
    try {
      readRuntimeConfig({ ...valid, API_INTERNAL_URL: secret });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toMatch(/API_INTERNAL_URL/);
    expect(message).not.toContain(secret);
  });

  it("ignore l'ancienne variable API_URL : seule API_INTERNAL_URL fait foi", () => {
    const config = readRuntimeConfig({ ...valid, API_URL: "http://ancienne:1" });
    expect(config.apiUrl).toBe("http://api:3000");
  });

  it("n'accepte plus API_URL à la place d'API_INTERNAL_URL", () => {
    const { API_INTERNAL_URL: _omitted, ...withoutInternal } = valid;
    expect(() =>
      readRuntimeConfig({ ...withoutInternal, API_URL: "http://api:3000" }),
    ).toThrowError(/API_INTERNAL_URL/);
  });
});

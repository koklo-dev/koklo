import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  RECONCILE_MAX_PROVIDER_CALLS_DEFAULT,
  RECONCILE_MAX_PROVIDER_CALLS_MAX,
  RECONCILE_MAX_PROVIDER_CALLS_MIN,
} from "@koklo/domain";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.ts";

/**
 * TK-46c AC-15 (suite) : `RECONCILE_MAX_PROVIDER_CALLS` (entier de 10 à 5000, défaut 300) lu dans
 * `WorkerConfig.reconcileMaxProviderCalls` ; valeur invalide = échec au démarrage nommant la
 * variable sans citer la valeur. Et l'extraction de `indexBranch` hors de `webhook/push.ts`.
 * Tests statiques, sans Docker.
 */
const BASE = { DATABASE_URL: "postgresql://u:p@h:5432/d" };
const worker = resolve(import.meta.dirname, "..");
const callsOf = (env: Record<string, string>) =>
  (loadConfig(env) as unknown as { reconcileMaxProviderCalls?: number }).reconcileMaxProviderCalls;

describe("constantes du domaine", () => {
  it("défaut 300, bornes 10 à 5000", () => {
    expect([
      RECONCILE_MAX_PROVIDER_CALLS_DEFAULT,
      RECONCILE_MAX_PROVIDER_CALLS_MIN,
      RECONCILE_MAX_PROVIDER_CALLS_MAX,
    ]).toEqual([300, 10, 5000]);
  });
});

describe("RECONCILE_MAX_PROVIDER_CALLS", () => {
  it.each([
    [undefined, 300],
    ["", 300],
    ["300", 300],
    ["10", 10],
    ["1000", 1000],
    ["5000", 5000],
  ])("%j -> %d appels", (value, calls) => {
    const env = value === undefined ? BASE : { ...BASE, RECONCILE_MAX_PROVIDER_CALLS: value };
    expect(callsOf(env)).toBe(calls);
  });

  it.each(["0", "9", "5001", "99999", "abc", "10.5", "-300", "300 appels"])(
    "%j : échec au démarrage nommant la variable, sans la valeur",
    (value) => {
      let message = "";
      try {
        loadConfig({ ...BASE, RECONCILE_MAX_PROVIDER_CALLS: value });
      } catch (error) {
        message = (error as Error).message;
      }
      expect(message).toContain("RECONCILE_MAX_PROVIDER_CALLS");
      expect(message).not.toContain(value);
    },
  );

  it("est documentée dans .env.example du worker", () => {
    expect(readFileSync(join(worker, ".env.example"), "utf8")).toMatch(
      /^RECONCILE_MAX_PROVIDER_CALLS=/m,
    );
  });
});

describe("extraction de l'indexation d'une branche", () => {
  it("webhook/push.ts exporte indexBranch (réutilisée par la réconciliation, sans copie)", async () => {
    const module = "../src/webhook/push.ts";
    const push = (await import(/* @vite-ignore */ module)) as Record<string, unknown>;
    expect(typeof push.indexBranch).toBe("function");
    expect(typeof push.handlePush).toBe("function");
  });
});

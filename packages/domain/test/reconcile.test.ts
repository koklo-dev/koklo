import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import * as domain from "../src/index.ts";

/**
 * TK-46a : constantes de la réconciliation périodique, partagées par le worker (et lues par les
 * tests d'intégration). Fichier attendu : `packages/domain/src/reconcile.ts`, ré-exporté par
 * `index.ts`. Pures, sans I/O. Le cron et le fuseau restent dans le worker (`jobs/reconcile.ts`).
 */
const constants = domain as unknown as Record<string, unknown>;
const srcFile = resolve(import.meta.dirname, "../src/reconcile.ts");

describe("constantes de la réconciliation", () => {
  it("la file pg-boss s'appelle `reconcile`", () => {
    expect(constants.RECONCILE_QUEUE).toBe("reconcile");
  });

  it("grâce avant de juger une ligne orpheline : défaut 15 min, bornes 5 à 1440", () => {
    expect([
      constants.RECONCILE_GRACE_MINUTES_DEFAULT,
      constants.RECONCILE_GRACE_MINUTES_MIN,
      constants.RECONCILE_GRACE_MINUTES_MAX,
    ]).toEqual([15, 5, 1440]);
  });

  it("plafond de lignes ré-enfilées par passe et par run : 200", () => {
    expect(constants.RECONCILE_MAX_REQUEUES_DEFAULT).toBe(200);
  });

  it("la clé du verrou consultatif est un entier sûr, positif", () => {
    const key = constants.RECONCILE_LOCK_KEY;
    expect(typeof key).toBe("number");
    expect(Number.isSafeInteger(key)).toBe(true);
    expect(key as number).toBeGreaterThan(0);
  });

  it("vit dans son propre fichier, sans dépendance (pures)", () => {
    expect(existsSync(srcFile)).toBe(true);
    expect(readFileSync(srcFile, "utf8")).not.toMatch(/^import .* from "(?!\.\/)/m);
  });
});

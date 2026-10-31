import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.ts";

/**
 * TK-46a AC-15 `reconcile-config-bounds` : `RECONCILE_GRACE_MINUTES` (entier de 5 à 1440, défaut 15)
 * lu dans `WorkerConfig.reconcileGraceMinutes` ; valeur invalide = échec au démarrage nommant la
 * variable sans citer la valeur. Tests statiques, sans Docker.
 */
const BASE = { DATABASE_URL: "postgresql://u:p@h:5432/d" };
const worker = resolve(import.meta.dirname, "..");
const graceOf = (env: Record<string, string>) =>
  (loadConfig(env) as unknown as { reconcileGraceMinutes?: number }).reconcileGraceMinutes;

describe("RECONCILE_GRACE_MINUTES", () => {
  it.each([
    [undefined, 15],
    ["", 15],
    ["15", 15],
    ["5", 5],
    ["60", 60],
    ["1440", 1440],
  ])("%j -> %d minutes", (value, minutes) => {
    const env = value === undefined ? BASE : { ...BASE, RECONCILE_GRACE_MINUTES: value };
    expect(graceOf(env)).toBe(minutes);
  });

  it.each(["0", "4", "1441", "99999", "abc", "7.5", "-15", "15 minutes"])(
    "%j : échec au démarrage nommant la variable, sans la valeur",
    (value) => {
      let message = "";
      try {
        loadConfig({ ...BASE, RECONCILE_GRACE_MINUTES: value });
      } catch (error) {
        message = (error as Error).message;
      }
      expect(message).toContain("RECONCILE_GRACE_MINUTES");
      expect(message).not.toContain(value);
    },
  );

  it("est documentée dans .env.example du worker", () => {
    expect(readFileSync(join(worker, ".env.example"), "utf8")).toMatch(
      /^RECONCILE_GRACE_MINUTES=/m,
    );
  });
});

describe("module de job", () => {
  it("expose la file, le cron toutes les 10 minutes et le fuseau UTC", async () => {
    const module = "../src/jobs/reconcile.ts";
    const job = (await import(/* @vite-ignore */ module).catch(() => ({}))) as Record<
      string,
      unknown
    >;
    expect([job.RECONCILE_QUEUE, job.RECONCILE_CRON, job.RECONCILE_TIMEZONE]).toEqual([
      "reconcile",
      "*/10 * * * *",
      "UTC",
    ]);
  });
});

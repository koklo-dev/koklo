import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.ts";

/**
 * TK-45b §7.1 : `WEBHOOK_RETENTION_DAYS` (entier de 1 à 365, défaut 30) lu par le worker dans
 * `WorkerConfig.webhookRetentionDays` ; valeur invalide = échec de configuration au démarrage, nommant
 * la variable sans citer la valeur. Le worker ne lit AUCUN secret de webhook (le secret est celui de
 * l'API, 45c). Tests statiques, sans Docker.
 */
const BASE = { DATABASE_URL: "postgresql://u:p@h:5432/d" };
const worker = resolve(import.meta.dirname, "..");

describe("WEBHOOK_RETENTION_DAYS", () => {
  it.each([
    [undefined, 30],
    ["", 30],
    ["30", 30],
    ["7", 7],
    ["1", 1],
    ["365", 365],
  ])("%j -> %d jours", (value, days) => {
    const env = value === undefined ? BASE : { ...BASE, WEBHOOK_RETENTION_DAYS: value };
    expect(
      (loadConfig(env) as unknown as { webhookRetentionDays: number }).webhookRetentionDays,
    ).toBe(days);
  });

  it.each(["0", "366", "9999", "abc", "1.5", "-3", "7 jours"])(
    "%j : échec au démarrage nommant la variable, sans la valeur",
    (value) => {
      let message = "";
      try {
        loadConfig({ ...BASE, WEBHOOK_RETENTION_DAYS: value });
      } catch (error) {
        message = (error as Error).message;
      }
      expect(message).toContain("WEBHOOK_RETENTION_DAYS");
      expect(message).not.toContain(value);
    },
  );

  it("est documentée dans .env.example du worker", () => {
    expect(readFileSync(join(worker, ".env.example"), "utf8")).toMatch(/^WEBHOOK_RETENTION_DAYS=/m);
  });
});

describe("files et secrets", () => {
  it("les modules de jobs exposent les noms de files contractuels", async () => {
    const delivery = await import("../src/jobs/webhook-delivery.ts");
    const purge = await import("../src/jobs/webhook-purge.ts");
    expect(delivery.WEBHOOK_DELIVERY_QUEUE).toBe("webhook-delivery");
    expect(purge.WEBHOOK_PURGE_QUEUE).toBe("webhook-purge");
  });

  it("le worker ne lit aucun secret de webhook et ne vérifie aucune signature", () => {
    const sources = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) return sources(path);
        return path.endsWith(".ts") && !path.endsWith(".test.ts") ? [path] : [];
      });
    const offenders = [...sources(join(worker, "src")), join(worker, ".env.example")].filter(
      (file) =>
        /GITHUB_WEBHOOK_SECRET|GH_WEBHOOK_SECRET|x-hub-signature|createHmac/i.test(
          readFileSync(file, "utf8"),
        ),
    );
    expect(offenders).toEqual([]);
  });
});

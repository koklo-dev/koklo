import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runPrismaOrThrow } from "../src/testing/prisma-cli.ts";
import { createTestDatabase, type TestDatabase } from "../src/testing/test-database.ts";
import {
  COMPATIBLE_URL,
  insertCredential,
  insertMonthly,
  insertSettings,
  insertUsageModel,
} from "./support/ai-providers-fixtures.ts";
import { insertScope } from "./support/ticket-fixtures.ts";

/** TK-95 (lot C) : contraintes des colonnes ajoutées et des trois tables, prouvées par SQL direct. */
const FOREIGN_KEY = "23503";
const UNIQUE = "23505";
const CHECK = "23514";
const INVALID_ENUM = "22P02";
const BIGINT_OVER_INT = "3000000000";
const MAX_BIGINT = "9223372036854775807";

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
  runPrismaOrThrow(["migrate", "deploy"], db.url);
}, 180_000);

afterAll(async () => {
  await db?.dispose();
}, 60_000);

const orgOf = async (label: string) => (await insertScope(db, label)).organizationId;

/** SQLSTATE de l'échec, `"ok"` si l'écriture a réussi. */
async function outcome(work: () => Promise<unknown>): Promise<string> {
  try {
    await work();
    return "ok";
  } catch (error) {
    return (error as { code?: string }).code ?? "unknown";
  }
}

describe("llm_provider_credentials.base_url", () => {
  it("accepte les six fournisseurs ; base_url n'existe que pour openai_compatible", async () => {
    const org = await orgOf("url-ok");
    for (const provider of ["anthropic", "openai", "google", "mistral", "openrouter"]) {
      expect(await outcome(() => insertCredential(db, org, provider))).toBe("ok");
    }
    expect(
      await outcome(() =>
        insertCredential(db, org, "openai_compatible", { baseUrl: COMPATIBLE_URL }),
      ),
    ).toBe("ok");
  });

  it("refuse base_url sur un autre fournisseur et son absence pour openai_compatible", async () => {
    const org = await orgOf("url-iff");
    expect(
      await outcome(() => insertCredential(db, org, "mistral", { baseUrl: COMPATIBLE_URL })),
    ).toBe(CHECK);
    expect(await outcome(() => insertCredential(db, org, "openai_compatible"))).toBe(CHECK);
  });

  it.each([
    ["http://llm.example.org/v1"],
    ["ftp://llm.example.org"],
    ["llm.example.org"],
    [`https://${"a".repeat(2050)}.org`],
    [""],
  ])("refuse l'adresse %s (https seul, 1 à 2048 caractères)", async (baseUrl) => {
    const org = await orgOf("url-bad");
    expect(await outcome(() => insertCredential(db, org, "openai_compatible", { baseUrl }))).toBe(
      CHECK,
    );
  });

  it("rejette un fournisseur inconnu", async () => {
    const org = await orgOf("enum");
    expect(await outcome(() => insertCredential(db, org, "cohere"))).toBe(INVALID_ENUM);
  });
});

describe("ai_organization_settings", () => {
  it("une ligne par organisation ; défauts : secours activé, pas de plafond, pas d'alerte", async () => {
    const org = await orgOf("set-default");
    await insertCredential(db, org, "anthropic");
    await db.query(
      "INSERT INTO ai_organization_settings (organization_id, created_at, updated_at) VALUES ($1, now(), now())",
      [org],
    );
    const [row] = await db.query<Record<string, unknown>>(
      "SELECT * FROM ai_organization_settings WHERE organization_id = $1",
      [org],
    );
    expect(row).toMatchObject({
      primary_provider: null,
      fallback_provider: null,
      fallback_enabled: true,
      monthly_cap_micro_usd: null,
      cap_warned_month: null,
    });
    expect(await outcome(() => insertSettings(db, org))).toBe(UNIQUE);
  });

  it("le plafond est un BIGINT (au-delà de 2^31 - 1), strictement positif", async () => {
    const org = await orgOf("set-cap");
    expect(await outcome(() => insertSettings(db, org, { cap: BIGINT_OVER_INT }))).toBe("ok");
    const other = await orgOf("set-cap-bad");
    expect(await outcome(() => insertSettings(db, other, { cap: 0 }))).toBe(CHECK);
    expect(await outcome(() => insertSettings(db, other, { cap: -1 }))).toBe(CHECK);
  });

  it("principal et secours doivent être des clés enregistrées de l'organisation", async () => {
    const org = await orgOf("set-fk");
    await insertCredential(db, org, "anthropic");
    expect(await outcome(() => insertSettings(db, org, { primary: "openai" }))).toBe(FOREIGN_KEY);
    expect(
      await outcome(() => insertSettings(db, org, { primary: "anthropic", fallback: "mistral" })),
    ).toBe(FOREIGN_KEY);
    const stranger = await orgOf("set-fk-other");
    await insertCredential(db, stranger, "mistral");
    expect(await outcome(() => insertSettings(db, org, { primary: "mistral" }))).toBe(FOREIGN_KEY);
  });

  it("le principal et le secours sont différents", async () => {
    const org = await orgOf("set-same");
    await insertCredential(db, org, "anthropic");
    expect(
      await outcome(() => insertSettings(db, org, { primary: "anthropic", fallback: "anthropic" })),
    ).toBe(CHECK);
  });
});

describe("ai_organization_settings : références aux clés", () => {
  it("une clé désignée principal ou secours ne se supprime pas (NO ACTION) ; libre, elle se supprime", async () => {
    const org = await orgOf("set-restrict");
    await insertCredential(db, org, "anthropic");
    await insertCredential(db, org, "openai");
    await insertCredential(db, org, "google");
    await insertSettings(db, org, { primary: "anthropic", fallback: "openai" });
    const remove = (provider: string) =>
      outcome(() =>
        db.query(
          "DELETE FROM llm_provider_credentials WHERE organization_id = $1 AND provider = $2::llm_provider",
          [org, provider],
        ),
      );
    expect(await remove("anthropic")).toBe(FOREIGN_KEY);
    expect(await remove("openai")).toBe(FOREIGN_KEY);
    expect(await remove("google")).toBe("ok");
  });

  it("la marque d'alerte est une date, supprimée avec l'organisation", async () => {
    const org = await orgOf("set-month");
    await insertSettings(db, org, { cap: 1000, warnedMonth: "2026-11-01" });
    await db.query("DELETE FROM organizations WHERE id = $1", [org]);
    const rows = await db.query(
      "SELECT 1 FROM ai_organization_settings WHERE organization_id = $1",
      [org],
    );
    expect(rows).toHaveLength(0);
  });
});

describe("ai_usage_models", () => {
  it("un modèle par organisation et par usage ; usage hors liste refusé", async () => {
    const org = await orgOf("um-pk");
    await insertCredential(db, org, "anthropic");
    await insertUsageModel(db, org, "idea_space", "anthropic");
    expect(await outcome(() => insertUsageModel(db, org, "idea_space", "anthropic"))).toBe(UNIQUE);
    expect(await outcome(() => insertUsageModel(db, org, "chat", "anthropic"))).toBe(INVALID_ENUM);
  });

  it("le fournisseur doit être une clé de l'organisation", async () => {
    const org = await orgOf("um-fk");
    expect(await outcome(() => insertUsageModel(db, org, "idea_space", "openai"))).toBe(
      FOREIGN_KEY,
    );
  });

  it("le modèle suit la règle de default_model : 1 à 100 caractères, ni « / » ni « .. »", async () => {
    const org = await orgOf("um-model");
    await insertCredential(db, org, "anthropic");
    for (const model of ["", "m".repeat(101), "a/b", "a..b"]) {
      expect(await outcome(() => insertUsageModel(db, org, "idea_space", "anthropic", model))).toBe(
        CHECK,
      );
    }
  });

  it("le retrait d'une clé supprime en cascade ses lignes d'usage", async () => {
    const org = await orgOf("um-cascade");
    await insertCredential(db, org, "anthropic");
    await insertCredential(db, org, "mistral");
    await insertUsageModel(db, org, "idea_space", "anthropic");
    await insertUsageModel(db, org, "spec_deliverables", "mistral", "mistral-large-latest");
    await db.query(
      "DELETE FROM llm_provider_credentials WHERE organization_id = $1 AND provider = 'mistral'",
      [org],
    );
    const left = await db.query<{ usage: string }>(
      "SELECT usage::text AS usage FROM ai_usage_models WHERE organization_id = $1",
      [org],
    );
    expect(left).toEqual([{ usage: "idea_space" }]);
  });
});

describe("ai_usage_monthly", () => {
  it("un compteur par organisation, mois et fournisseur ; BIGINT pour jetons et coût", async () => {
    const org = await orgOf("mo-pk");
    await insertMonthly(db, org, {
      input: BIGINT_OVER_INT,
      output: MAX_BIGINT,
      cost: BIGINT_OVER_INT,
    });
    expect(await outcome(() => insertMonthly(db, org))).toBe(UNIQUE);
    expect(await outcome(() => insertMonthly(db, org, { month: "2026-12-01" }))).toBe("ok");
    expect(await outcome(() => insertMonthly(db, org, { provider: "mistral" }))).toBe("ok");
  });

  it.each([
    ["calls", { calls: -1 }],
    ["input_tokens", { input: -1 }],
    ["output_tokens", { output: -1 }],
    ["cost_micro_usd", { cost: -1 }],
  ])("refuse %s négatif (CHECK >= 0)", async (_name, override) => {
    const org = await orgOf("mo-neg");
    expect(await outcome(() => insertMonthly(db, org, override))).toBe(CHECK);
  });

  it("calls est un INTEGER : une valeur au-delà de 2^31 - 1 déborde", async () => {
    const org = await orgOf("mo-int");
    expect(await outcome(() => insertMonthly(db, org, { calls: Number(BIGINT_OVER_INT) }))).toBe(
      "22003",
    );
  });

  it("le mois est le premier jour du mois (UTC)", async () => {
    const org = await orgOf("mo-month");
    expect(await outcome(() => insertMonthly(db, org, { month: "2026-11-15" }))).toBe(CHECK);
  });

  it("l'historique survit au retrait de la clé (aucune clé étrangère vers les clés) et part avec l'organisation", async () => {
    const org = await orgOf("mo-history");
    await insertCredential(db, org, "mistral");
    await insertMonthly(db, org, { provider: "mistral", calls: 3, cost: 42 });
    await db.query("DELETE FROM llm_provider_credentials WHERE organization_id = $1", [org]);
    const kept = await db.query("SELECT 1 FROM ai_usage_monthly WHERE organization_id = $1", [org]);
    expect(kept).toHaveLength(1);
    await db.query("DELETE FROM organizations WHERE id = $1", [org]);
    expect(
      await db.query("SELECT 1 FROM ai_usage_monthly WHERE organization_id = $1", [org]),
    ).toHaveLength(0);
  });

  it("refuse une organisation inconnue", async () => {
    expect(await outcome(() => insertMonthly(db, randomUUID()))).toBe(FOREIGN_KEY);
  });
});

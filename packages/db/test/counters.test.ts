import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as dbPackage from "../src/index.ts";
import { raiseCounterTo } from "../src/index.ts";
import { runPrismaOrThrow } from "../src/testing/prisma-cli.ts";
import { createTestDatabase, type TestDatabase } from "../src/testing/test-database.ts";
import { insertCounter, insertScope, type Scope, sqlState } from "./support/ticket-fixtures.ts";

/**
 * TK-45a : `raiseCounterTo` est déplacé de `apps/api/src/tracker/counters.ts` vers `@koklo/db`
 * (exporté par `src/index.ts`) pour que le worker (relevé du compteur `feature`) l'utilise.
 *   raiseCounterTo(tx, scope: { organizationId: string; projectId: string },
 *                  name: "ticket" | "sprint" | "feature", atLeast: number): Promise<void>
 * `tx` : client de transaction du client multi-tenant (`createDbClient(...).$transaction`), sous
 * `withOrganization`. Crée la ligne si absente, relève à `atLeast` si elle est plus basse, ne la
 * fait jamais reculer. `atLeast` doit être un entier de 0 à 2 147 483 647 : sinon `RangeError`
 * AVANT toute écriture.
 */
const { createDbClient, withOrganization } = dbPackage;
type Name = "ticket" | "sprint" | "feature";

let database: TestDatabase;
let tenant: ReturnType<typeof createDbClient>;

beforeAll(async () => {
  database = await createTestDatabase();
  runPrismaOrThrow(["migrate", "deploy"], database.url);
  tenant = createDbClient(database.url);
}, 180_000);

afterAll(async () => {
  await tenant?.$disconnect();
  await database?.dispose();
}, 60_000);

const raise = (scope: Scope, name: Name, atLeast: number, orgContext = scope.organizationId) => {
  expect(typeof raiseCounterTo, "raiseCounterTo exporté par @koklo/db").toBe("function");
  return withOrganization(orgContext, () =>
    tenant.$transaction((tx) => raiseCounterTo(tx, scope, name, atLeast)),
  );
};
const counterValue = async (scope: Scope, name: Name): Promise<number | undefined> =>
  (
    await database.query<{ last_value: number }>(
      "SELECT last_value FROM project_counters WHERE project_id = $1 AND name = $2::counter_name",
      [scope.projectId, name],
    )
  )[0]?.last_value;

describe("TK-45a raiseCounterTo exporté par @koklo/db", () => {
  it("est une fonction exportée par l'index du paquet", () => {
    expect(typeof dbPackage.raiseCounterTo).toBe("function");
  });
});

describe("TK-45a raiseCounterTo : relève, ne recule jamais", () => {
  it("crée le compteur absent à la valeur demandée", async () => {
    const scope = await insertScope(database, "raise-create");

    await raise(scope, "feature", 20);

    expect(await counterValue(scope, "feature")).toBe(20);
  });

  it("relève un compteur plus bas", async () => {
    const scope = await insertScope(database, "raise-up");
    await insertCounter(database, scope, "ticket", 3);

    await raise(scope, "ticket", 10);

    expect(await counterValue(scope, "ticket")).toBe(10);
  });
});

describe("TK-45a raiseCounterTo : ne baisse jamais", () => {
  it("ne baisse jamais : une valeur plus basse ou égale laisse le compteur intact, sans erreur", async () => {
    const scope = await insertScope(database, "raise-never-down");
    await insertCounter(database, scope, "sprint", 10);

    await raise(scope, "sprint", 4);
    expect(await counterValue(scope, "sprint")).toBe(10);
    await raise(scope, "sprint", 10);
    expect(await counterValue(scope, "sprint")).toBe(10);
    await raise(scope, "sprint", 0);
    expect(await counterValue(scope, "sprint")).toBe(10);
  });

  it("une suite de relevés ne fait que monter : le résultat est le maximum", async () => {
    const scope = await insertScope(database, "raise-sequence");

    for (const n of [5, 3, 21, 8, 21, 2]) await raise(scope, "feature", n);

    expect(await counterValue(scope, "feature")).toBe(21);
  });

  it("accepte 0 (ligne créée à 0) et la borne haute 2 147 483 647", async () => {
    const zero = await insertScope(database, "raise-zero");
    await raise(zero, "ticket", 0);
    expect(await counterValue(zero, "ticket")).toBe(0);

    const top = await insertScope(database, "raise-top");
    await raise(top, "ticket", 2_147_483_647);
    expect(await counterValue(top, "ticket")).toBe(2_147_483_647);
  });
});

describe("TK-45a raiseCounterTo : indépendance et transaction", () => {
  it("les trois noms sont indépendants, ainsi que les projets", async () => {
    const a = await insertScope(database, "raise-names-a");
    const b = await insertScope(database, "raise-names-b");

    await raise(a, "ticket", 1);
    await raise(a, "sprint", 2);
    await raise(a, "feature", 3);
    await raise(b, "feature", 9);

    expect([
      await counterValue(a, "ticket"),
      await counterValue(a, "sprint"),
      await counterValue(a, "feature"),
    ]).toEqual([1, 2, 3]);
    expect(await counterValue(b, "feature")).toBe(9);
    expect(await counterValue(b, "ticket")).toBeUndefined();
  });

  it("n'écrit qu'avec la transaction appelante : un échec ultérieur annule le relevé", async () => {
    const scope = await insertScope(database, "raise-rollback");
    await insertCounter(database, scope, "feature", 2);

    await expect(
      withOrganization(scope.organizationId, () =>
        tenant.$transaction(async (tx) => {
          await raiseCounterTo(tx, scope, "feature", 50);
          throw new Error("échec ultérieur");
        }),
      ),
    ).rejects.toThrow("échec ultérieur");

    expect(await counterValue(scope, "feature")).toBe(2);
  });
});

describe("TK-45a raiseCounterTo : concurrence", () => {
  it("40 relevés simultanés de valeurs différentes : aucune erreur, maximum final", async () => {
    const scope = await insertScope(database, "raise-concurrent");
    const values = Array.from({ length: 40 }, (_, i) => ((i * 37) % 101) + 1);

    await Promise.all(values.map((n) => raise(scope, "feature", n)));

    expect(await counterValue(scope, "feature")).toBe(Math.max(...values));
  }, 60_000);

  it("relevés simultanés sur un compteur existant plus haut : valeur inchangée", async () => {
    const scope = await insertScope(database, "raise-concurrent-high");
    await insertCounter(database, scope, "feature", 500);

    await Promise.all(Array.from({ length: 20 }, (_, i) => raise(scope, "feature", i + 1)));

    expect(await counterValue(scope, "feature")).toBe(500);
  }, 60_000);

  it("relevés simultanés sur des projets différents ne se mélangent pas", async () => {
    const scopes = await Promise.all(
      [1, 2, 3, 4].map((i) => insertScope(database, `raise-par-${i}`)),
    );

    await Promise.all(scopes.map((scope, i) => raise(scope, "sprint", (i + 1) * 10)));

    expect(await Promise.all(scopes.map((scope) => counterValue(scope, "sprint")))).toEqual([
      10, 20, 30, 40,
    ]);
  }, 60_000);
});

describe("TK-45a raiseCounterTo : valeurs invalides", () => {
  it.each([
    ["négative", -1],
    ["fractionnaire", 1.5],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["au-dessus de l'entier 32 bits", 2_147_483_648],
    ["hors entier sûr", 2 ** 60],
    ["une chaîne", "5" as unknown as number],
    ["null", null as unknown as number],
    ["undefined", undefined as unknown as number],
  ])("%s : RangeError, aucune ligne créée", async (_label, value) => {
    const scope = await insertScope(database, "raise-invalid");

    await expect(raise(scope, "feature", value)).rejects.toBeInstanceOf(RangeError);

    expect(await counterValue(scope, "feature")).toBeUndefined();
  });

  it("une valeur invalide ne modifie pas un compteur existant", async () => {
    const scope = await insertScope(database, "raise-invalid-existing");
    await insertCounter(database, scope, "ticket", 7);

    await expect(raise(scope, "ticket", -5)).rejects.toBeInstanceOf(RangeError);

    expect(await counterValue(scope, "ticket")).toBe(7);
  });
});

describe("TK-45a raiseCounterTo : isolation multi-tenant", () => {
  it("une portée d'une autre organisation que le contexte est refusée et n'écrit rien", async () => {
    const a = await insertScope(database, "raise-tenant-a");
    const b = await insertScope(database, "raise-tenant-b");

    await expect(raise(b, "feature", 30, a.organizationId)).rejects.toThrow();

    expect(await counterValue(b, "feature")).toBeUndefined();
    expect(await counterValue(a, "feature")).toBeUndefined();
  });

  it("sans contexte d'organisation, l'appel est refusé", async () => {
    const scope = await insertScope(database, "raise-no-context");
    expect(typeof raiseCounterTo, "raiseCounterTo exporté par @koklo/db").toBe("function");

    await expect(
      tenant.$transaction((tx) => raiseCounterTo(tx, scope, "feature", 3)),
    ).rejects.toThrow();

    expect(await counterValue(scope, "feature")).toBeUndefined();
  });
});

describe("TK-45a déclencheur de compteur monotone (garde de base, en plus de la requête)", () => {
  it("un UPDATE direct qui baisse le compteur est refusé par la base", async () => {
    const scope = await insertScope(database, "trigger-down");
    await insertCounter(database, scope, "feature", 10);

    await expect(
      database.query("UPDATE project_counters SET last_value = 4 WHERE project_id = $1", [
        scope.projectId,
      ]),
    ).rejects.toThrow(/never decreases/);

    expect(await counterValue(scope, "feature")).toBe(10);
  });

  it("une hausse directe passe, une valeur égale passe", async () => {
    const scope = await insertScope(database, "trigger-up");
    await insertCounter(database, scope, "feature", 10);

    expect(
      await sqlState(() =>
        database.query("UPDATE project_counters SET last_value = 10 WHERE project_id = $1", [
          scope.projectId,
        ]),
      ),
    ).toBeUndefined();
    expect(
      await sqlState(() =>
        database.query("UPDATE project_counters SET last_value = 11 WHERE project_id = $1", [
          scope.projectId,
        ]),
      ),
    ).toBeUndefined();
    expect(await counterValue(scope, "feature")).toBe(11);
  });
});

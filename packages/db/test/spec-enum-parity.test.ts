import * as domain from "@koklo/domain";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runPrismaOrThrow } from "../src/testing/prisma-cli.ts";
import { createTestDatabase, type TestDatabase } from "../src/testing/test-database.ts";
import { allowedValues, schemaEnumValues } from "./support/spec-fixtures.ts";

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
  runPrismaOrThrow(["migrate", "deploy"], db.url);
}, 180_000);

afterAll(async () => {
  await db?.dispose();
}, 60_000);

const sorted = (values: readonly string[]) => [...values].sort();

describe("TK-41 C3 parité des enums avec @koklo/domain", () => {
  it("webhook_deliveries.event = WEBHOOK_EVENTS exactement", async () => {
    expect(await allowedValues(db, "webhook_deliveries", "event")).toEqual(
      sorted(domain.WEBHOOK_EVENTS),
    );
  });

  it("provider_installations.owner_kind = valeurs de GitOwner['kind']", async () => {
    expect(await allowedValues(db, "provider_installations", "owner_kind")).toEqual([
      "organization",
      "user",
    ]);
  });

  it("H3 : le domaine exporte REPO_ROLES et REPO_MODES (CDC §4)", () => {
    const exported = domain as unknown as Record<string, readonly string[] | undefined>;
    expect(exported.REPO_ROLES, "REPO_ROLES absent de @koklo/domain (H3)").toBeDefined();
    expect(exported.REPO_MODES, "REPO_MODES absent de @koklo/domain (H3)").toBeDefined();
    expect(sorted(exported.REPO_ROLES ?? [])).toEqual([
      "back",
      "front",
      "mobile",
      "monorepo",
      "spec",
    ]);
    expect(sorted(exported.REPO_MODES ?? [])).toEqual(["adopted", "new"]);
  });
});

describe("TK-41 C3 parité des enums avec @koklo/domain : valeurs de project_repos et de @koklo/schema", () => {
  it("project_repos.role = REPO_ROLES et project_repos.mode = REPO_MODES", async () => {
    const exported = domain as unknown as Record<string, readonly string[] | undefined>;
    expect(await allowedValues(db, "project_repos", "role")).toEqual(
      sorted(exported.REPO_ROLES ?? []),
    );
    expect(await allowedValues(db, "project_repos", "mode")).toEqual(
      sorted(exported.REPO_MODES ?? []),
    );
    expect(await allowedValues(db, "project_repos", "role")).toEqual([
      "back",
      "front",
      "mobile",
      "monorepo",
      "spec",
    ]);
    expect(await allowedValues(db, "project_repos", "mode")).toEqual(["adopted", "new"]);
  });

  it("spec_features.status/priority et spec_endpoints.method = énumérations de @koklo/schema", async () => {
    expect(await allowedValues(db, "spec_features", "status")).toEqual(
      schemaEnumValues("feature.ts", "statut"),
    );
    expect(await allowedValues(db, "spec_features", "priority")).toEqual(
      schemaEnumValues("feature.ts", "priorite"),
    );
    expect(await allowedValues(db, "spec_endpoints", "method")).toEqual(
      schemaEnumValues("data.ts", "methode"),
    );
  });

  it("les autres listes fermées ont les valeurs du contrat", async () => {
    const expected: [string, string, string[]][] = [
      ["provider_installations", "provider", ["github"]],
      ["webhook_deliveries", "provider", ["github"]],
      ["provider_installations", "status", ["active", "deleted", "suspended"]],
      ["spec_snapshots", "status", ["building", "failed", "ready"]],
      ["spec_write_batches", "status", ["committed", "committing", "conflict", "failed", "queued"]],
      [
        "webhook_deliveries",
        "status",
        ["failed", "ignored", "processed", "processing", "received"],
      ],
    ];
    for (const [table, column, values] of expected) {
      expect(await allowedValues(db, table, column), `${table}.${column}`).toEqual(values);
    }
  });
});

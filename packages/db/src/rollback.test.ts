import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { latestMigration, rollbackLatest } from "./rollback.ts";

let dir: string;

function addMigration(name: string, withDown = true): void {
  mkdirSync(join(dir, name));
  writeFileSync(join(dir, name, "migration.sql"), "SELECT 1;");
  if (withDown) {
    writeFileSync(join(dir, name, "down.sql"), "SELECT 2;");
  }
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "koklo-db-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("latestMigration", () => {
  it("retourne le dernier dossier par ordre lexical et ignore les fichiers", () => {
    addMigration("20260101000000_init");
    addMigration("20260202000000_next");
    writeFileSync(join(dir, "migration_lock.toml"), 'provider = "postgresql"');

    expect(latestMigration(dir)).toBe("20260202000000_next");
  });

  it("échoue si le dossier est absent", () => {
    expect(() => latestMigration(join(dir, "absent"))).toThrow(/absent/);
  });

  it("échoue s'il n'y a aucune migration", () => {
    expect(() => latestMigration(dir)).toThrow(/Aucune migration/);
  });

  it("échoue si down.sql manque", () => {
    addMigration("20260101000000_init", false);

    expect(() => latestMigration(dir)).toThrow(/down\.sql manquant/);
  });
});

describe("rollbackLatest", () => {
  it("exécute down.sql puis retire la ligne du ledger, dans cet ordre", async () => {
    addMigration("20260101000000_init");
    const calls: string[] = [];

    const name = await rollbackLatest(dir, {
      runSqlFile: (file) => calls.push(`run:${file}`),
      forgetMigration: async (migration) => {
        calls.push(`forget:${migration}`);
      },
    });

    expect(name).toBe("20260101000000_init");
    expect(calls).toEqual([
      `run:${join(dir, "20260101000000_init", "down.sql")}`,
      "forget:20260101000000_init",
    ]);
  });

  it("ne touche pas au ledger si l'exécution du SQL échoue", async () => {
    addMigration("20260101000000_init");
    let forgotten = false;

    await expect(
      rollbackLatest(dir, {
        runSqlFile: () => {
          throw new Error("boom");
        },
        forgetMigration: async () => {
          forgotten = true;
        },
      }),
    ).rejects.toThrow("boom");
    expect(forgotten).toBe(false);
  });
});

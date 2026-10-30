import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Garde-fou : tout Postgres de test passe par `startTestPostgres` (datadir en tmpfs), sinon chaque
 * conteneur laisse un volume Docker anonyme. Test statique, sans Docker.
 */
const testDir = import.meta.dirname;
const helper = join(testDir, "support", "postgres.ts");

describe("Postgres de test du worker", () => {
  it("le helper monte le datadir en tmpfs", () => {
    expect(readFileSync(helper, "utf8")).toMatch(
      /\.withTmpFs\(\{\s*"\/var\/lib\/postgresql\/data":/,
    );
  });

  it("aucun test n'instancie PostgreSqlContainer hors du helper", () => {
    const offenders = readdirSync(testDir)
      .filter((name) => name.endsWith(".ts") && name !== "postgres-tmpfs.test.ts")
      .filter((name) =>
        /new\s+(PostgreSqlContainer|GenericContainer)\b/.test(
          readFileSync(join(testDir, name), "utf8"),
        ),
      );
    expect(offenders).toEqual([]);
  });
});

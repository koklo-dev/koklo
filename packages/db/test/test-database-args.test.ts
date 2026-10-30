import { describe, expect, it } from "vitest";
import { postgresRunArgs } from "../src/testing/test-database.ts";

/** Garde-fou sans Docker : le Postgres de test ne doit jamais créer de volume anonyme. */
describe("postgresRunArgs", () => {
  it("monte le datadir en tmpfs", () => {
    const args = postgresRunArgs();
    const index = args.indexOf("--tmpfs");
    expect(index).toBeGreaterThan(-1);
    expect(args[index + 1]).toMatch(/^\/var\/lib\/postgresql\/data(:|$)/);
  });

  it("est supprimé à l'arrêt et n'expose que le loopback sur un port aléatoire", () => {
    const args = postgresRunArgs();
    expect(args).toContain("--rm");
    expect(args).toContain("127.0.0.1::5432");
  });
});

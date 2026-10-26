import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const configDir = fileURLToPath(new URL("..", import.meta.url));
const fixtures = fileURLToPath(new URL("../fixtures/", import.meta.url));

function biomeCi(file: string) {
  return spawnSync(
    "pnpm",
    ["exec", "biome", "ci", `--config-path=${configDir}`, `${fixtures}${file}`],
    { cwd: configDir, encoding: "utf8" },
  );
}

describe("règles Biome partagées", () => {
  it("rejette une fonction de 51 lignes (noExcessiveLinesPerFunction)", () => {
    const result = biomeCi("function-51-lines.ts");
    expect(result.status).not.toBe(0);
    expect(result.stdout + result.stderr).toContain("noExcessiveLinesPerFunction");
  });

  it("accepte une fonction de 50 lignes", () => {
    const result = biomeCi("function-50-lines.ts");
    expect(result.stdout + result.stderr).not.toContain("noExcessiveLinesPerFunction");
    expect(result.status).toBe(0);
  });
});

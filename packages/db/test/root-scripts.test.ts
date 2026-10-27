import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { packageRoot } from "../src/testing/prisma-cli.ts";

const rootPackage = JSON.parse(
  readFileSync(join(packageRoot, "..", "..", "package.json"), "utf8"),
) as { scripts?: Record<string, string> };

describe("scripts racine (T4.1)", () => {
  it.each(["db:migrate", "db:rollback", "db:seed"])("%s existe et délègue à @koklo/db", (name) => {
    const script = rootPackage.scripts?.[name];

    expect(script, `script racine ${name}`).toBeTruthy();
    expect(script).toMatch(/@koklo\/db|packages\/db/);
  });
});

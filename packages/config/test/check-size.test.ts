import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { checkSize } from "../src/check-size.ts";

const script = fileURLToPath(new URL("../src/check-size.ts", import.meta.url));
const packageJsonPath = fileURLToPath(new URL("../package.json", import.meta.url));
const TODAY = new Date("2026-06-15T12:00:00Z");

const created: string[] = [];

async function makeRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "check-size-"));
  created.push(root);
  return root;
}

async function put(root: string, rel: string, content: string): Promise<void> {
  const target = join(root, rel);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, content);
}

function lines(count: number): string {
  return "const x = 1;\n".repeat(count);
}

function waiver(overrides: Record<string, string> = {}): string {
  const entry = {
    file: "src/big.ts",
    rule: "max-file-lines",
    justification: "legacy",
    author: "jane.doe",
    expires: "2026-12-31",
    ...overrides,
  };
  const body = Object.entries(entry)
    .map(([key, value], index) => `${index === 0 ? "  - " : "    "}${key}: "${value}"`)
    .join("\n");
  return `waivers:\n${body}\n`;
}

function runCli(root: string) {
  return spawnSync(process.execPath, [script, root], { encoding: "utf8" });
}

afterEach(async () => {
  await Promise.all(created.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("check-size : fichiers source (C1a, C1b, C0)", () => {
  it("C1a : rejette un source de 301 lignes avec fichier, lignes et limite", async () => {
    const root = await makeRoot();
    await put(root, "src/big.ts", lines(301));
    const violations = await checkSize({ root, today: TODAY });
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({
      file: "src/big.ts",
      kind: "source",
      lines: 301,
      limit: 300,
      reason: "too-long",
    });
    expect(violations[0]?.message).toContain("src/big.ts");
  });

  it("C1b : accepte un source de 300 lignes", async () => {
    const root = await makeRoot();
    await put(root, "src/ok.ts", lines(300));
    expect(await checkSize({ root, today: TODAY })).toEqual([]);
  });

  it("C0 : fonctionne sans .koklo/waivers.yaml", async () => {
    const root = await makeRoot();
    await put(root, "src/small.ts", lines(3));
    expect(await checkSize({ root, today: TODAY })).toEqual([]);
  });

  it.each(["ts", "tsx", "js", "jsx", "mjs", "cjs", "mts", "cts"])(
    "compte l'extension .%s comme source",
    async (ext) => {
      const root = await makeRoot();
      await put(root, `src/big.${ext}`, lines(301));
      const violations = await checkSize({ root, today: TODAY });
      expect(violations.map((v) => v.file)).toEqual([`src/big.${ext}`]);
    },
  );
});

describe("check-size : fichiers et dossiers ignorés", () => {
  it("ignore les extensions non source (json, md, sql, css)", async () => {
    const root = await makeRoot();
    for (const ext of ["json", "md", "sql", "css", "yaml"]) {
      await put(root, `src/big.${ext}`, lines(900));
    }
    expect(await checkSize({ root, today: TODAY })).toEqual([]);
  });

  it("ignore les dossiers node_modules, .git, .worktrees, .workflow, dist, .next, coverage", async () => {
    const root = await makeRoot();
    for (const dir of [
      "node_modules/pkg",
      ".git/hooks",
      ".worktrees/issue-1/src",
      ".workflow/TK-1",
      "dist",
      ".next",
      "coverage",
    ]) {
      await put(root, `${dir}/big.ts`, lines(400));
    }
    expect(await checkSize({ root, today: TODAY })).toEqual([]);
  });
});

describe("check-size : fichiers de test (C1d)", () => {
  it("accepte un test de 500 lignes et rejette un test de 501 lignes", async () => {
    const root = await makeRoot();
    await put(root, "src/a.test.ts", lines(500));
    await put(root, "src/b.test.ts", lines(501));
    const violations = await checkSize({ root, today: TODAY });
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({
      file: "src/b.test.ts",
      kind: "test",
      lines: 501,
      limit: 500,
      reason: "too-long",
    });
  });

  it("un fichier *.test.ts de 400 lignes ne dépasse pas la limite de test", async () => {
    const root = await makeRoot();
    await put(root, "src/mid.test.ts", lines(400));
    expect(await checkSize({ root, today: TODAY })).toEqual([]);
  });

  it("reconnaît *.spec.* comme test", async () => {
    const root = await makeRoot();
    await put(root, "src/a.spec.tsx", lines(450));
    expect(await checkSize({ root, today: TODAY })).toEqual([]);
  });

  it.each(["test", "tests", "__tests__", "e2e"])(
    "reconnaît le dossier %s/ comme test",
    async (dir) => {
      const root = await makeRoot();
      await put(root, `pkg/${dir}/helper.ts`, lines(450));
      expect(await checkSize({ root, today: TODAY })).toEqual([]);
    },
  );

  it("compte N lignes pour un fichier de N lignes terminé par un saut de ligne", async () => {
    const root = await makeRoot();
    await put(root, "src/exact.ts", lines(7) + lines(294));
    const violations = await checkSize({ root, today: TODAY });
    expect(violations[0]?.lines).toBe(301);
  });
});

describe("check-size : exclusions (C3)", () => {
  it("ignore les segments migrations et generated", async () => {
    const root = await makeRoot();
    await put(root, "packages/db/prisma/migrations/0001/up.ts", lines(400));
    await put(root, "packages/db/generated/client.ts", lines(400));
    expect(await checkSize({ root, today: TODAY })).toEqual([]);
  });

  it("ignore *.generated.* et *.gen.*", async () => {
    const root = await makeRoot();
    await put(root, "src/api.generated.ts", lines(400));
    await put(root, "src/routes.gen.ts", lines(400));
    expect(await checkSize({ root, today: TODAY })).toEqual([]);
  });

  it.each(["// @generated", "// DO NOT EDIT"])(
    "ignore un fichier dont l'en-tête contient %s",
    async (marker) => {
      const root = await makeRoot();
      await put(root, "src/auto.ts", `// header\n${marker}\n${lines(400)}`);
      expect(await checkSize({ root, today: TODAY })).toEqual([]);
    },
  );

  it("ne tient pas compte d'un marqueur au-delà de la 5e ligne", async () => {
    const root = await makeRoot();
    await put(root, "src/late.ts", `${lines(5)}// @generated\n${lines(400)}`);
    const violations = await checkSize({ root, today: TODAY });
    expect(violations.map((v) => v.file)).toEqual(["src/late.ts"]);
  });
});

describe("check-size : dérogations (C2a-d)", () => {
  async function bigWithWaiver(yaml: string, rel = "src/big.ts") {
    const root = await makeRoot();
    await put(root, rel, lines(301));
    await put(root, ".koklo/waivers.yaml", yaml);
    return root;
  }

  it("C2a : une dérogation valide dispense le fichier", async () => {
    const root = await bigWithWaiver(waiver());
    expect(await checkSize({ root, today: TODAY })).toEqual([]);
  });

  it("C2a : accepte une date YAML non quotée", async () => {
    const yaml = waiver().replace('expires: "2026-12-31"', "expires: 2026-12-31");
    const root = await bigWithWaiver(yaml);
    expect(await checkSize({ root, today: TODAY })).toEqual([]);
  });

  it("C2b : une dérogation expirée donne waiver-expired avec le nom du fichier", async () => {
    const root = await bigWithWaiver(waiver({ expires: "2026-01-01" }));
    const violations = await checkSize({ root, today: TODAY });
    expect(violations).toHaveLength(1);
    expect(violations[0]?.reason).toBe("waiver-expired");
    expect(violations[0]?.file).toBe("src/big.ts");
    expect(violations[0]?.message).toContain("src/big.ts");
  });

  it("C2c : expire aujourd'hui = valable jusqu'à la fin du jour (UTC)", async () => {
    const root = await bigWithWaiver(waiver({ expires: "2026-06-15" }));
    const lateToday = new Date("2026-06-15T23:59:59Z");
    expect(await checkSize({ root, today: lateToday })).toEqual([]);
  });

  it("C2c : expirée hier = violation", async () => {
    const root = await bigWithWaiver(waiver({ expires: "2026-06-14" }));
    const violations = await checkSize({ root, today: TODAY });
    expect(violations.map((v) => v.reason)).toEqual(["waiver-expired"]);
  });

  it("C2d : une dérogation pour un autre fichier ne dispense pas", async () => {
    const root = await bigWithWaiver(waiver({ file: "src/other.ts" }));
    const violations = await checkSize({ root, today: TODAY });
    expect(violations.map((v) => [v.file, v.reason])).toEqual([["src/big.ts", "too-long"]]);
  });

  it("C2d : une dérogation pour une autre rule ne dispense pas", async () => {
    const root = await bigWithWaiver(waiver({ rule: "max-params" }));
    const violations = await checkSize({ root, today: TODAY });
    expect(violations.map((v) => v.reason)).toEqual(["too-long"]);
  });

  it("une dérogation dispense ce fichier seul", async () => {
    const root = await bigWithWaiver(waiver());
    await put(root, "src/other.ts", lines(301));
    const violations = await checkSize({ root, today: TODAY });
    expect(violations.map((v) => v.file)).toEqual(["src/other.ts"]);
  });
});

describe("check-size : waivers.yaml invalide (C2e)", () => {
  async function rejectsWith(yaml: string): Promise<Error> {
    const root = await makeRoot();
    await put(root, "src/ok.ts", lines(3));
    await put(root, ".koklo/waivers.yaml", yaml);
    const error = await checkSize({ root, today: TODAY }).then(
      () => null,
      (reason: unknown) => reason,
    );
    expect(error).toBeInstanceOf(Error);
    return error as Error;
  }

  it.each(["file", "rule", "justification", "author", "expires"])(
    "champ %s manquant : message citant le fichier et le champ",
    async (field) => {
      const yaml = waiver()
        .split("\n")
        .filter((line) => !line.includes(`${field}:`))
        .join("\n")
        .replace(/^ {4}/, "  - ");
      const error = await rejectsWith(yaml);
      expect(error.message).toContain(".koklo/waivers.yaml");
      expect(error.message).toContain(field);
    },
  );

  it("date illisible : message citant le fichier et expires", async () => {
    const error = await rejectsWith(waiver({ expires: "pas-une-date" }));
    expect(error.message).toContain(".koklo/waivers.yaml");
    expect(error.message).toContain("expires");
  });

  it("YAML syntaxiquement invalide : message citant le fichier", async () => {
    const error = await rejectsWith("waivers: [unclosed\n  - : :\n");
    expect(error.message).toContain(".koklo/waivers.yaml");
  });
});

describe("check-size : CLI (C1a, C1c, C2b, C2e)", () => {
  it("sort en 1 avec le nom du fichier sur stderr pour un source de 301 lignes", async () => {
    const root = await makeRoot();
    await put(root, "src/big.ts", lines(301));
    const result = runCli(root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("src/big.ts");
  });

  it("sort en 0 pour un dépôt conforme", async () => {
    const root = await makeRoot();
    await put(root, "src/ok.ts", lines(300));
    expect(runCli(root).status).toBe(0);
  });

  it("sort en 1 avec le fichier pour une dérogation expirée", async () => {
    const root = await makeRoot();
    await put(root, "src/big.ts", lines(301));
    await put(root, ".koklo/waivers.yaml", waiver({ expires: "2020-01-01" }));
    const result = runCli(root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("src/big.ts");
  });

  it("sort en 1 en citant waivers.yaml quand il est invalide", async () => {
    const root = await makeRoot();
    await put(root, "src/ok.ts", lines(3));
    await put(root, ".koklo/waivers.yaml", "waivers:\n  - file: src/ok.ts\n");
    const result = runCli(root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(".koklo/waivers.yaml");
  });
});

describe("check-size : branchement lint (C1c)", () => {
  it("le script lint appelle biome ci et check:size, et check:size est défini", async () => {
    const pkg = JSON.parse(await readFile(packageJsonPath, "utf8")) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts.lint).toContain("biome ci");
    expect(pkg.scripts.lint).toContain("check:size");
    expect(pkg.scripts["check:size"]).toBeTypeOf("string");
  });
});

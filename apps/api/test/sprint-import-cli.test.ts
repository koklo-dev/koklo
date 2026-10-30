import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TestDatabase } from "@koklo/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runImportSprints } from "../src/cli/import-sprints.ts";
import { REASON_CODES } from "../src/sprint-import/report.ts";
import {
  createSeededDatabase,
  TEST_AUTH_SECRET,
  TEST_AUTH_URL,
  TEST_GITHUB_CLIENT_ID,
  TEST_GITHUB_CLIENT_SECRET,
} from "./helpers/app.ts";
import { FIXTURE_DIR, sprintMarkdown, tableCounts, ticketBlock } from "./helpers/sprint-import.ts";
import { createWorld, type World } from "./helpers/tickets.ts";

/** TK-34 : point d'entrée `import-sprints` (commande d'administration, jamais exposée en HTTP). */
let database: TestDatabase;

beforeAll(async () => {
  database = await createSeededDatabase();
});

afterAll(async () => {
  await database?.dispose();
});

function run(argv: string[], today = "2026-10-30") {
  const out: string[] = [];
  const err: string[] = [];
  const env = {
    DATABASE_URL: database.url,
    BETTER_AUTH_SECRET: TEST_AUTH_SECRET,
    BETTER_AUTH_URL: TEST_AUTH_URL,
    GITHUB_CLIENT_ID: TEST_GITHUB_CLIENT_ID,
    GITHUB_CLIENT_SECRET: TEST_GITHUB_CLIENT_SECRET,
    APP_ENV: "test",
    LOG_LEVEL: "silent",
  };
  return runImportSprints(argv, {
    env,
    today: () => today,
    stdout: (text) => out.push(text),
    stderr: (text) => err.push(text),
  }).then((code) => ({ code, out: out.join("\n"), err: err.join("\n") }));
}

const scopeArgs = (world: World, role: "owner" | "admin" | "dev" = "owner") => [
  "--organization",
  world.organizationId,
  "--project",
  world.projectId,
  "--actor",
  world.actors[role].userId,
];

describe("import-sprints", () => {
  it("importe la fixture, sort 0 et écrit un rapport JSON stable avec --json", async () => {
    const world = await createWorld(database);
    const { code, out } = await run([FIXTURE_DIR, ...scopeArgs(world), "--json"]);
    expect(code).toBe(0);
    const report = JSON.parse(out);
    expect(report).toMatchObject({
      dryRun: false,
      ok: true,
      tickets: { created: 86 },
      sprints: { created: 17 },
    });
    for (const line of report.lines) {
      expect(REASON_CODES).toContain(line.code);
    }
    expect((await tableCounts(database, world.organizationId)).tickets).toBe(86);
  });

  it("sans date, les sprints reçoivent la date du jour injectée ; --starts-on/--ends-on la remplacent", async () => {
    const dated = await createWorld(database);
    await run([FIXTURE_DIR, ...scopeArgs(dated)], "2026-10-30");
    const rows = await database.query<{ d: string }>(
      "SELECT DISTINCT starts_on::text || '/' || ends_on::text AS d FROM sprints WHERE organization_id = $1",
      [dated.organizationId],
    );
    expect(rows.map((r) => r.d)).toEqual(["2026-10-30/2026-10-30"]);

    const explicit = await createWorld(database);
    await run([
      FIXTURE_DIR,
      ...scopeArgs(explicit),
      "--starts-on",
      "2026-11-02",
      "--ends-on",
      "2026-11-13",
    ]);
    const other = await database.query<{ d: string }>(
      "SELECT DISTINCT starts_on::text || '/' || ends_on::text AS d FROM sprints WHERE organization_id = $1",
      [explicit.organizationId],
    );
    expect(other.map((r) => r.d)).toEqual(["2026-11-02/2026-11-13"]);
  });
});

describe("import-sprints (suite 2)", () => {
  it("--dry-run produit le même rapport JSON sans écrire", async () => {
    const dryWorld = await createWorld(database);
    const realWorld = await createWorld(database);
    const dry = await run([FIXTURE_DIR, ...scopeArgs(dryWorld), "--dry-run", "--json"]);
    const real = await run([FIXTURE_DIR, ...scopeArgs(realWorld), "--json"]);
    expect(dry.code).toBe(0);
    expect({ ...JSON.parse(dry.out), dryRun: false }).toEqual(JSON.parse(real.out));
    expect(await tableCounts(database, dryWorld.organizationId)).toMatchObject({
      tickets: 0,
      sprints: 0,
      audit: 0,
    });
  });

  it("le rapport texte liste les totaux par code et ne divulgue ni URL de base ni secret", async () => {
    const world = await createWorld(database);
    const { out, err } = await run([FIXTURE_DIR, ...scopeArgs(world)]);
    expect(out).toContain("sprint-without-tasks");
    expect(out).toContain("human-action");
    expect(out).toContain(FIXTURE_DIR);
    for (const secret of [database.url, TEST_AUTH_SECRET, TEST_GITHUB_CLIENT_SECRET]) {
      expect(out + err).not.toContain(secret);
    }
  });

  it("sort 1 sur conflit ou erreur du rapport", async () => {
    const world = await createWorld(database);
    const dir = mkdtempSync(join(tmpdir(), "sprint-import-cli-"));
    try {
      writeFileSync(
        join(dir, "sprint-001.md"),
        sprintMarkdown(1, [ticketBlock({ key: "TK-1", title: "A", dependsOn: "TK-404" })]),
      );
      const { code, out } = await run([dir, ...scopeArgs(world), "--json"]);
      expect(code).toBe(1);
      expect(
        JSON.parse(out).lines.some((l: { code: string }) => l.code === "dependency-target-missing"),
      ).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("import-sprints : refus", () => {
  it.each([
    [
      "--organization absent",
      (w: World) => ["--project", w.projectId, "--actor", w.actors.owner.userId],
    ],
    [
      "--project absent",
      (w: World) => ["--organization", w.organizationId, "--actor", w.actors.owner.userId],
    ],
    [
      "--actor absent",
      (w: World) => ["--organization", w.organizationId, "--project", w.projectId],
    ],
    [
      "identifiant non UUID",
      (w: World) => [
        "--organization",
        "pas-un-uuid",
        "--project",
        w.projectId,
        "--actor",
        w.actors.owner.userId,
      ],
    ],
    ["option inconnue", (w: World) => [...scopeArgs(w), "--force"]],
    ["date invalide", (w: World) => [...scopeArgs(w), "--starts-on", "demain"]],
    [
      "fin avant début",
      (w: World) => [...scopeArgs(w), "--starts-on", "2026-11-13", "--ends-on", "2026-11-02"],
    ],
  ])("usage invalide (%s) : code 2, rien d'écrit", async (_label, build) => {
    const world = await createWorld(database);
    const { code, err } = await run([FIXTURE_DIR, ...build(world)]);
    expect(code).toBe(2);
    expect(err.length).toBeGreaterThan(0);
    expect((await tableCounts(database, world.organizationId)).tickets).toBe(0);
  });
});

describe("import-sprints : refus (suite 2)", () => {
  it("répertoire absent des arguments : code 2", async () => {
    const world = await createWorld(database);
    expect((await run(scopeArgs(world))).code).toBe(2);
  });

  it("acteur sans rôle owner/admin : code 2, rien d'écrit", async () => {
    const world = await createWorld(database);
    const { code, err } = await run([FIXTURE_DIR, ...scopeArgs(world, "dev")]);
    expect(code).toBe(2);
    expect(err).toMatch(/owner|admin/i);
    expect((await tableCounts(database, world.organizationId)).tickets).toBe(0);
  });

  it("acteur d'une autre organisation : code 2, rien d'écrit", async () => {
    const world = await createWorld(database);
    const stranger = await createWorld(database);
    const args = [
      "--organization",
      world.organizationId,
      "--project",
      world.projectId,
      "--actor",
      stranger.actors.owner.userId,
    ];
    const { code } = await run([FIXTURE_DIR, ...args]);
    expect(code).toBe(2);
    expect((await tableCounts(database, world.organizationId)).tickets).toBe(0);
  });

  it("projet d'une autre organisation : code 2, rien d'écrit", async () => {
    const world = await createWorld(database);
    const other = await createWorld(database);
    const args = [
      "--organization",
      world.organizationId,
      "--project",
      other.projectId,
      "--actor",
      world.actors.owner.userId,
    ];
    const { code } = await run([FIXTURE_DIR, ...args]);
    expect(code).toBe(2);
    expect((await tableCounts(database, other.organizationId)).tickets).toBe(0);
  });
});

describe("import-sprints : refus (suite 3)", () => {
  it("répertoire contenant un lien symbolique, un mauvais nom ou un fichier trop gros : code 2, rien d'écrit", async () => {
    const world = await createWorld(database);
    const dir = mkdtempSync(join(tmpdir(), "sprint-import-cli-"));
    try {
      writeFileSync(join(dir, "sprint-001.md"), sprintMarkdown(1, []));
      symlinkSync("/etc/passwd", join(dir, "sprint-002.md"));
      const link = await run([dir, ...scopeArgs(world)]);
      expect(link.code).toBe(2);
      expect(link.err).toMatch(/symlink|lien/i);

      rmSync(join(dir, "sprint-002.md"));
      writeFileSync(join(dir, "sprint-2.md"), sprintMarkdown(2, []));
      expect((await run([dir, ...scopeArgs(world)])).code).toBe(2);

      rmSync(join(dir, "sprint-2.md"));
      writeFileSync(join(dir, "sprint-003.md"), "a".repeat(1024 * 1024 + 1));
      expect((await run([dir, ...scopeArgs(world)])).code).toBe(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    expect(await tableCounts(database, world.organizationId)).toMatchObject({
      tickets: 0,
      sprints: 0,
    });
  });

  it("répertoire inexistant : code 2", async () => {
    const world = await createWorld(database);
    expect((await run(["/chemin/qui/n/existe/pas", ...scopeArgs(world)])).code).toBe(2);
  });
});

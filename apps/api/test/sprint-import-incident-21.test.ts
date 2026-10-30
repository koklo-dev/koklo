import type { TestDatabase } from "@koklo/db/testing";
import type { INestApplication } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseSprintFile } from "../src/sprint-import/parse-sprint-file.ts";
import { createApp, createSeededDatabase } from "./helpers/app.ts";
import { IMPORT_OPTIONS, importerOf, scopeOf, tableCounts } from "./helpers/sprint-import.ts";
import { createWorld } from "./helpers/tickets.ts";

/**
 * Incident 21 (annexe C) : des tickets jamais matérialisés à cause d'une regex trop stricte, sans
 * alerte. Un fichier mal formé ne doit faire disparaître AUCUNE ligne sans trace au rapport.
 */
const FILE = "sprint-099.md";
const TEXT = [
  "# Sprint 099 — Mal formé",
  "",
  "## 🎯 Sprint Goal",
  "Objectif",
  "",
  "## ✅ Tasks",
  "- [x] **[TK-9x]** Clé mal formée",
  "  - Labels : pkg:api, safe",
  "- [ ] **[TK-91]** Sans labels",
  "  - Dépend de : aucune",
  "- [ ] **[TK-92]** Dépendance malformée",
  "  - Labels : pkg:api, safe",
  "  - Dépend de : TK-1;; ???",
  "- [ ] **[TK-93]** Bon ticket",
  "  - Labels : pkg:api, safe",
  "  - Dépend de : aucune",
  "Ligne bizarre au milieu",
  "  - Champ inconnu : x",
  "",
].join("\n");
const lineOf = (needle: string) => TEXT.split("\n").findIndex((l) => l.includes(needle)) + 1;

let database: TestDatabase;
let app: INestApplication;

beforeAll(async () => {
  database = await createSeededDatabase();
  app = await createApp({ databaseUrl: database.url });
});

afterAll(async () => {
  await app?.close();
  await database?.dispose();
});

describe("incident-21-no-silent-skip", () => {
  it("incident-21-no-silent-skip : le parseur rapporte chaque cas, avec fichier, ligne et raison", () => {
    const sprint = parseSprintFile(FILE, TEXT);
    const find = (needle: string, code: string) =>
      sprint.report.find((l) => l.line === lineOf(needle) && l.code === code);

    expect(find("TK-9x", "unknown-line")).toMatchObject({ file: FILE, severity: "error" });
    expect(find("TK-9x", "unknown-line")?.text).toContain("TK-9x");
    expect(find("Sans labels", "missing-sensitivity")).toMatchObject({
      file: FILE,
      key: "TK-91",
      severity: "error",
    });
    expect(find("TK-1;; ???", "unknown-line")).toMatchObject({ file: FILE, severity: "error" });
    expect(find("Ligne bizarre", "unknown-line")).toMatchObject({ file: FILE, severity: "error" });
    expect(find("Champ inconnu", "unknown-line")).toMatchObject({ file: FILE, severity: "error" });
  });

  it("incident-21-no-silent-skip : têtes détectées = tickets lus + tickets rejetés rapportés", () => {
    const sprint = parseSprintFile(FILE, TEXT);
    expect(sprint.ticketHeads).toBe(4);
    expect(sprint.tickets.map((t) => t.key)).toEqual(["TK-92", "TK-93"]);
    expect(sprint.rejected).toEqual([
      { line: lineOf("TK-9x"), key: null },
      { line: lineOf("TK-91"), key: "TK-91" },
    ]);
    expect(sprint.tickets.length + sprint.rejected.length).toBe(sprint.ticketHeads);
    // Chaque ligne de la zone reçoit une classe : rien n'est perdu.
    expect(sprint.taskZone).toHaveLength(TEXT.split("\n").length - lineOf("## ✅ Tasks"));
    expect(sprint.taskZone.filter((c) => c.kind === "error").length).toBeGreaterThanOrEqual(4);
  });
});

describe("incident-21-no-silent-skip (suite 2)", () => {
  it("incident-21-no-silent-skip : l'import ne perd aucun ticket sans alerte", async () => {
    const world = await createWorld(database);
    const report = await importerOf(app).run(
      scopeOf(world),
      [{ fileName: FILE, text: TEXT }],
      IMPORT_OPTIONS,
    );

    expect(report.ok).toBe(false);
    expect(report.tickets.created).toBe(2);
    expect(report.tickets.rejected).toBe(2);
    expect(report.tickets.created + report.tickets.rejected + report.tickets.matched).toBe(4);
    expect((await tableCounts(database, world.organizationId)).tickets).toBe(2);
    for (const needle of ["TK-9x", "Sans labels", "TK-1;; ???", "Ligne bizarre", "Champ inconnu"]) {
      expect(
        report.lines.some((l) => l.file === FILE && l.line === lineOf(needle)),
        needle,
      ).toBe(true);
    }
    expect(report.totalsByCode["unknown-line"]).toBeGreaterThanOrEqual(4);
    expect(report.totalsByCode["missing-sensitivity"]).toBe(1);
  });
});

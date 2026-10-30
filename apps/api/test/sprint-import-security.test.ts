import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readSprintDirectory } from "../src/sprint-import/read-sprint-directory.ts";
import { FIXTURE_DIR, sprintMarkdown } from "./helpers/sprint-import.ts";

/** TK-34 §9 : le répertoire est une entrée non fiable ; lecture seule, pas de lien, nom et taille bornés. */
let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "sprint-import-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const valid = () => sprintMarkdown(1, []);

describe("readSprintDirectory", () => {
  it("lit les 17 fichiers de la fixture, triés, et ignore backlog/retro en les consignant", async () => {
    const result = await readSprintDirectory(FIXTURE_DIR);
    expect(result.sources.map((s) => s.fileName)).toEqual(
      Array.from({ length: 17 }, (_, i) => `sprint-${String(i + 1).padStart(3, "0")}.md`),
    );
    expect(result.directory).toBe(FIXTURE_DIR);
  });

  it("consigne les fichiers hors sprint (backlog.md, retro-*.md) sans les lire", async () => {
    writeFileSync(join(dir, "sprint-001.md"), valid());
    writeFileSync(join(dir, "backlog.md"), "# x");
    writeFileSync(join(dir, "retro-sprint-001.md"), "# x");
    const result = await readSprintDirectory(dir);
    expect(result.sources.map((s) => s.fileName)).toEqual(["sprint-001.md"]);
    expect(result.skipped.map((s) => s.name).sort()).toEqual(["backlog.md", "retro-sprint-001.md"]);
  });

  it("refuse un chemin inexistant et un chemin qui n'est pas un répertoire", async () => {
    await expect(readSprintDirectory(join(dir, "absent"))).rejects.toMatchObject({
      code: "not-found",
    });
    writeFileSync(join(dir, "sprint-001.md"), valid());
    await expect(readSprintDirectory(join(dir, "sprint-001.md"))).rejects.toMatchObject({
      code: "not-a-directory",
    });
  });

  it("refuse un lien symbolique, même vers un fichier valide", async () => {
    writeFileSync(join(dir, "real.txt"), valid());
    symlinkSync(join(dir, "real.txt"), join(dir, "sprint-001.md"));
    await expect(readSprintDirectory(dir)).rejects.toMatchObject({ code: "symlink" });
  });
});

describe("readSprintDirectory (suite 2)", () => {
  it("refuse un lien symbolique vers l'extérieur (ex. /etc/passwd)", async () => {
    symlinkSync("/etc/passwd", join(dir, "sprint-002.md"));
    await expect(readSprintDirectory(dir)).rejects.toMatchObject({ code: "symlink" });
  });

  it("refuse un nom qui ressemble à un sprint sans respecter sprint-NNN.md", async () => {
    for (const name of [
      "sprint-1.md",
      "sprint-0001.md",
      "sprint-001.md.bak",
      "sprint-abc.md",
      "sprint-001.MD",
    ]) {
      writeFileSync(join(dir, name), valid());
      await expect(readSprintDirectory(dir), name).rejects.toMatchObject({ code: "bad-name" });
      rmSync(join(dir, name));
    }
  });

  it("refuse une entrée sprint-NNN.md qui n'est pas un fichier régulier", async () => {
    mkdirSync(join(dir, "sprint-003.md"));
    await expect(readSprintDirectory(dir)).rejects.toMatchObject({ code: "not-a-file" });
  });

  it("refuse un fichier de plus de 1 Mio mais accepte exactement 1 Mio", async () => {
    writeFileSync(join(dir, "sprint-004.md"), "a".repeat(1024 * 1024 + 1));
    await expect(readSprintDirectory(dir)).rejects.toMatchObject({ code: "too-large" });
    writeFileSync(join(dir, "sprint-004.md"), "a".repeat(1024 * 1024));
    await expect(readSprintDirectory(dir)).resolves.toMatchObject({
      sources: [{ fileName: "sprint-004.md" }],
    });
  });
});

describe("readSprintDirectory (suite 3)", () => {
  it("refuse un fichier qui n'est pas de l'UTF-8 valide", async () => {
    writeFileSync(join(dir, "sprint-005.md"), Buffer.from([0xff, 0xfe, 0x00, 0xc3, 0x28]));
    await expect(readSprintDirectory(dir)).rejects.toMatchObject({ code: "not-utf8" });
  });

  it("ne descend pas dans les sous-répertoires", async () => {
    mkdirSync(join(dir, "sous"));
    writeFileSync(join(dir, "sous", "sprint-006.md"), valid());
    writeFileSync(join(dir, "sprint-001.md"), valid());
    const result = await readSprintDirectory(dir);
    expect(result.sources.map((s) => s.fileName)).toEqual(["sprint-001.md"]);
  });
});

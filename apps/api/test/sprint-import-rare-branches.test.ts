import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parseSprintFile } from "../src/sprint-import/parse-sprint-file.ts";
import { readSprintDirectory } from "../src/sprint-import/read-sprint-directory.ts";

/** TK-34, refactor : branches rares du parseur et de la lecture de répertoire. */
const dirs: string[] = [];
const tempDir = async () => {
  const dir = await mkdtemp(join(tmpdir(), "koklo-rare-"));
  dirs.push(dir);
  return dir;
};
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("parseSprintFile : cas rares", () => {
  it("refuse un nom de fichier invalide", () => {
    expect(() => parseSprintFile("sprint-000.md", "")).toThrow(/nom de fichier de sprint invalide/);
    expect(() => parseSprintFile("notes.md", "")).toThrow(/nom de fichier de sprint invalide/);
  });

  it("signale un fichier vide : objectif absent (erreur) et section Tasks absente (ignorée)", () => {
    const result = parseSprintFile("sprint-001.md", "");
    expect(result.tickets).toEqual([]);
    const codes = result.report.map((l) => [l.code, l.severity]);
    expect(codes).toContainEqual(["unknown-line", "error"]);
    expect(codes).toContainEqual(["sprint-without-tasks", "ignored"]);
  });
});

describe("readSprintDirectory : erreurs d'E/S", () => {
  it("signale un répertoire illisible (autre erreur que ENOENT)", async () => {
    const dir = await tempDir();
    const blocked = join(dir, "blocked");
    await mkdir(blocked);
    await chmod(blocked, 0o000);
    try {
      await expect(readSprintDirectory(join(blocked, "inner"))).rejects.toMatchObject({
        code: "not-found",
      });
    } finally {
      await chmod(blocked, 0o700);
    }
  });

  it("signale un fichier sprint illisible", async () => {
    const dir = await tempDir();
    const file = join(dir, "sprint-001.md");
    await writeFile(file, "# x");
    await chmod(file, 0o000);
    try {
      await expect(readSprintDirectory(dir)).rejects.toMatchObject({ code: "not-a-file" });
    } finally {
      await chmod(file, 0o600);
    }
  });
});

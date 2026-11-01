import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveWorktree } from "../../src/claude-code/index.ts";
import { InvalidAgentRequestError } from "../../src/index.ts";
import { makeRequest } from "../agent-helpers.ts";
import { launches, makeRuntime, makeSandbox, script } from "./support.ts";

describe("resolveWorktree", () => {
  it("rend le chemin reel d'un worktree sous une racine autorisee", async () => {
    const sandbox = makeSandbox();
    expect(await resolveWorktree(sandbox.worktree, [sandbox.root])).toBe(sandbox.worktree);
  });

  it("suit un lien symbolique qui reste sous la racine", async () => {
    const sandbox = makeSandbox();
    const link = join(sandbox.root, "alias");
    symlinkSync(sandbox.worktree, link);
    expect(await resolveWorktree(link, [sandbox.root])).toBe(sandbox.worktree);
  });

  it.each([
    ["relatif", () => "tk-73/sous-dossier"],
    ["hors de la racine autorisee", () => "/tmp"],
    ["inexistant", (root: string) => join(root, "absent")],
    [
      "fichier ordinaire",
      (root: string) => {
        const file = join(root, "fichier.txt");
        writeFileSync(file, "x");
        return file;
      },
    ],
    ["avec un segment ..", (root: string) => `${root}/../..`],
    ["avec un octet NUL", (root: string) => `${root}/tk\u0000`],
    ["egal a la racine elle-meme", (root: string) => root],
    [
      "prefixe textuel de la racine",
      (root: string) => {
        mkdirSync(`${root}-voisin`);
        return `${root}-voisin`;
      },
    ],
  ])("refuse un worktree %s", async (_label, make) => {
    const sandbox = makeSandbox();
    const error = await resolveWorktree(make(sandbox.root), [sandbox.root]).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(InvalidAgentRequestError);
    expect(error).toMatchObject({ reason: "worktree" });
  });

  it("refuse un lien symbolique qui s'echappe de la racine", async () => {
    const sandbox = makeSandbox();
    const link = join(sandbox.root, "evasion");
    symlinkSync("/tmp", link);
    const error = await resolveWorktree(link, [sandbox.root]).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(InvalidAgentRequestError);
  });

  it("refuse tout quand aucune racine n'est autorisee", async () => {
    const sandbox = makeSandbox();
    await expect(resolveWorktree(sandbox.worktree, [])).rejects.toBeInstanceOf(
      InvalidAgentRequestError,
    );
  });
});

describe("worktree invalide : refus avant tout lancement", () => {
  it("n'execute rien pour un worktree hors racine ou qui s'echappe", async () => {
    const sandbox = makeSandbox();
    script(sandbox, { scenario: "completed" });
    const link = join(sandbox.root, "evasion");
    symlinkSync("/tmp", link);
    for (const worktree of ["/tmp", link, join(sandbox.root, "absent")]) {
      await expect(
        makeRuntime(sandbox).launchSession(makeRequest({ worktree })),
      ).rejects.toBeInstanceOf(InvalidAgentRequestError);
    }
    expect(launches(sandbox)).toBe(0);
  });
});

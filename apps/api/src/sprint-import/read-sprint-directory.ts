import { constants } from "node:fs";
import { lstat, open, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { clip } from "./report.ts";

export type SprintImportPathErrorCode =
  | "not-found"
  | "not-a-directory"
  | "symlink"
  | "bad-name"
  | "not-a-file"
  | "too-large"
  | "not-utf8";

/** Entrée refusée avant toute lecture du contenu ou écriture en base (le chemin est non fiable). */
export class SprintImportPathError extends Error {
  constructor(
    readonly code: SprintImportPathErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "SprintImportPathError";
  }
}

export interface SprintSource {
  fileName: string;
  text: string;
}

export interface SprintDirectory {
  directory: string;
  sources: SprintSource[];
  skipped: { name: string; reason: string }[];
}

/** Taille maximale d'un fichier de sprint : 1 Mio. */
export const MAX_SPRINT_FILE_BYTES = 1024 * 1024;

const SPRINT_NAME = /^sprint-[0-9]{3}\.md$/;
const SPRINT_LIKE = /^sprint-/;

const fail = (code: SprintImportPathErrorCode, message: string): never => {
  throw new SprintImportPathError(code, message);
};

async function checkDirectory(directory: string): Promise<void> {
  const info = await lstat(directory).catch((error: NodeJS.ErrnoException) =>
    fail(
      "not-found",
      error.code === "ENOENT"
        ? `répertoire introuvable : ${clip(directory)}`
        : `répertoire illisible : ${clip(directory)} (${error.code ?? "erreur"})`,
    ),
  );
  if (info.isSymbolicLink()) fail("symlink", `lien symbolique refusé : ${clip(directory)}`);
  if (!info.isDirectory()) fail("not-a-directory", `pas un répertoire : ${clip(directory)}`);
}

/** Ouvre sans suivre de lien (O_NOFOLLOW) puis relit le type et la taille sur le descripteur. */
async function readSprintFile(path: string, name: string): Promise<string> {
  const handle = await open(
    path,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  ).catch((error: NodeJS.ErrnoException) =>
    error.code === "ELOOP"
      ? fail("symlink", `lien symbolique refusé : ${name}`)
      : fail("not-a-file", `fichier illisible : ${name} (${error.code ?? "erreur"})`),
  );
  try {
    const info = await handle.stat();
    if (!info.isFile()) fail("not-a-file", `pas un fichier régulier : ${name}`);
    if (info.size > MAX_SPRINT_FILE_BYTES) {
      fail("too-large", `fichier trop gros (> ${MAX_SPRINT_FILE_BYTES} octets) : ${name}`);
    }
    const bytes = await handle.readFile();
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      return fail("not-utf8", `fichier non UTF-8 : ${name}`);
    }
  } finally {
    await handle.close();
  }
}

/**
 * Lit les `sprint-NNN.md` d'UN répertoire (lecture seule, sans récursion, sans lien symbolique).
 * Toute entrée `sprint-*` qui ne respecte pas le motif est refusée ; les autres fichiers
 * (backlog, rétros, sous-répertoires) ne sont pas lus mais consignés dans `skipped`.
 */
export async function readSprintDirectory(path: string): Promise<SprintDirectory> {
  const directory = resolve(path);
  await checkDirectory(directory);
  const names = (await readdir(directory)).sort();
  const sources: SprintSource[] = [];
  const skipped: SprintDirectory["skipped"] = [];
  for (const name of names) {
    if (!SPRINT_LIKE.test(name)) {
      skipped.push({ name, reason: "hors motif sprint-NNN.md : non lu" });
    } else if (!SPRINT_NAME.test(name)) {
      fail("bad-name", `nom refusé (attendu sprint-NNN.md) : ${clip(name)}`);
    } else {
      sources.push({ fileName: name, text: await readSprintFile(join(directory, name), name) });
    }
  }
  return { directory, sources, skipped };
}

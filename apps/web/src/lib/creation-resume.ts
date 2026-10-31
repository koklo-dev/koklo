/** Squelette Red (TK-48 / 48c) : marqueur de reprise de création de projet (sessionStorage, sans secret). */
export const CREATION_RESUME_KEY = "koklo:project-creation-resume";
export const CREATION_RESUME_TTL_MS = 60 * 60 * 1000;

export interface CreationResume {
  projectId: string;
  projectName: string;
  installationId: string;
  repoName?: string;
  /** Instant d'écriture, en millisecondes depuis l'epoch. */
  savedAt: number;
}

export function writeCreationResume(_marker: CreationResume): void {
  throw new Error("writeCreationResume: non implémenté (TK-48c)");
}

export function readCreationResume(_now?: number): CreationResume | null {
  throw new Error("readCreationResume: non implémenté (TK-48c)");
}

export function clearCreationResume(): void {
  throw new Error("clearCreationResume: non implémenté (TK-48c)");
}

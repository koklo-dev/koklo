import { z } from "zod";

/** Marqueur de reprise de création de projet (sessionStorage, sans secret : design/screens/S-projects.md §5.1). */
export const CREATION_RESUME_KEY = "koklo:project-creation-resume";
export const CREATION_RESUME_TTL_MS = 60 * 60 * 1000;

const markerSchema = z.strictObject({
  projectId: z.uuid(),
  projectName: z.string().min(1),
  installationId: z.uuid(),
  repoName: z.string().optional(),
  /** Instant d'écriture, en millisecondes depuis l'epoch. */
  savedAt: z.number(),
});

export interface CreationResume {
  projectId: string;
  projectName: string;
  installationId: string;
  repoName?: string;
  savedAt: number;
}

/** Le stockage de l'onglet peut être indisponible ou lever : il ne bloque jamais un parcours. */
function attempt<T>(action: () => T, fallback: T): T {
  try {
    return action();
  } catch {
    return fallback;
  }
}

export function writeCreationResume(marker: CreationResume): void {
  attempt(() => sessionStorage.setItem(CREATION_RESUME_KEY, JSON.stringify(marker)), undefined);
}

export function readCreationResume(now: number = Date.now()): CreationResume | null {
  const raw = attempt(() => sessionStorage.getItem(CREATION_RESUME_KEY), null);
  if (raw === null) return null;
  const parsed = markerSchema.safeParse(attempt<unknown>(() => JSON.parse(raw), null));
  if (!parsed.success || now - parsed.data.savedAt > CREATION_RESUME_TTL_MS) return null;
  const { repoName, ...rest } = parsed.data;
  return repoName === undefined ? rest : { ...rest, repoName };
}

export function clearCreationResume(): void {
  attempt(() => sessionStorage.removeItem(CREATION_RESUME_KEY), undefined);
}

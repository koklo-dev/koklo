import { InvalidProjectStateVersionError, StaleProjectStateError } from "./errors.ts";

export interface ProjectState<T> {
  readonly version: number;
  readonly content: T;
}

const isVersion = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 1;

export const createProjectState = <T>(content: T): ProjectState<T> =>
  Object.freeze({ version: 1, content });

/** Écriture optimiste : remplacement complet du contenu, refusée si la version attendue est périmée. */
export const writeProjectState = <T, U = T>(
  current: ProjectState<T>,
  expectedVersion: number,
  nextContent: U,
): ProjectState<U> => {
  if (!isVersion(expectedVersion)) throw new InvalidProjectStateVersionError(expectedVersion);
  if (!isVersion(current.version)) throw new InvalidProjectStateVersionError(current.version);
  if (current.version !== expectedVersion)
    throw new StaleProjectStateError(current, expectedVersion);
  return Object.freeze({ version: current.version + 1, content: nextContent });
};

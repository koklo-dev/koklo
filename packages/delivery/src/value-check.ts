/** Contrôles de valeurs d'entrée, partagés par `startRun`, les événements et les plafonds. */
export const isCount = (value: unknown): value is number =>
  Number.isInteger(value) && (value as number) >= 0;

export const isText = (value: unknown): value is string =>
  typeof value === "string" && value.trim() !== "";

/** Copie profonde puis gel profond : la sortie n'alias jamais les entrées de l'appelant. */
export const frozenCopy = <T>(value: T): T => deepFreeze(structuredClone(value));

const deepFreeze = <T>(value: T): T => {
  if (typeof value === "object" && value !== null) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
};

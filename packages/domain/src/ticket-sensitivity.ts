import { InvalidSensitivityError } from "./errors.ts";
import { isOneOf } from "./one-of.ts";

export const SENSITIVITIES = ["safe", "sensitive"] as const;

export type Sensitivity = (typeof SENSITIVITIES)[number];

export const isSensitivity = (value: unknown): value is Sensitivity =>
  isOneOf(SENSITIVITIES, value);

export const parseSensitivity = (value: unknown): Sensitivity => {
  if (!isSensitivity(value)) throw new InvalidSensitivityError(value);
  return value;
};

/** CDC §11.3 : un ticket sensible exige une approbation humaine avant fusion. */
export const requiresHumanApproval = (sensitivity: Sensitivity): boolean =>
  sensitivity === "sensitive";

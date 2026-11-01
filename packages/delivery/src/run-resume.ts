/** SQUELETTE (TK-72 lot 1, étape RED). */

import type { Run } from "./run.ts";
import type { RunEffect } from "./run-effects.ts";

export const resumePoint = (_run: Run): RunEffect | null => {
  throw new Error("not implemented");
};

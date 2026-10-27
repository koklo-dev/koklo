import { oc } from "@orpc/contract";
import { openapi } from "@orpc/openapi";
import type { z } from "zod";
import { authErrors, internalError } from "./errors.ts";
import { healthInputSchema, healthOutputSchema, projectListOutputSchema } from "./schemas.ts";

const health = oc
  .meta(openapi({ method: "GET", path: "/health" }))
  .errors(internalError)
  .input(healthInputSchema)
  .output(healthOutputSchema);

const projectList = oc
  .meta(openapi({ method: "GET", path: "/projects" }))
  .errors({ ...internalError, ...authErrors })
  .output(projectListOutputSchema);

export const contract = { health, project: { list: projectList } };

export type HealthInput = z.input<typeof healthInputSchema>;
export type HealthOutput = z.output<typeof healthOutputSchema>;
export type ProjectListOutput = z.output<typeof projectListOutputSchema>;

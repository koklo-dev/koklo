import type { ProjectStateUpdateInput } from "@koklo/contract";
import { StaleProjectStateError, writeProjectState } from "@koklo/domain";
import { Inject, Injectable } from "@nestjs/common";
import { toApiError, viaDomain } from "../tracker/api-errors.ts";
import type { ProjectScope } from "../tracker/scope.ts";
import {
  PROJECT_STATE_REPOSITORY,
  type ProjectStateRepository,
} from "./project-state.repository.ts";

interface ProjectStateOutput {
  version: number;
  content: Record<string, unknown>;
}

const outputOf = ({ version, content }: ProjectStateOutput): ProjectStateOutput => ({
  version,
  content,
});

/** État de projet : le domaine porte la règle de version, la base sérialise les écritures. */
@Injectable()
export class ProjectStateService {
  constructor(
    @Inject(PROJECT_STATE_REPOSITORY) private readonly repository: ProjectStateRepository,
  ) {}

  get(scope: ProjectScope): Promise<ProjectStateOutput> {
    return this.repository.run(scope, async (store) => outputOf(await store.ensure()));
  }

  update(scope: ProjectScope, input: ProjectStateUpdateInput): Promise<ProjectStateOutput> {
    return this.repository.run(scope, async (store) => {
      const current = await store.ensure();
      const next = viaDomain(() =>
        writeProjectState(current, input.expectedVersion, input.content),
      );
      // Garde atomique : si une écriture concurrente a gagné entre la lecture et l'UPDATE, on relit.
      const written = await store.write(current.version, next.content);
      if (!written) {
        const latest = await store.ensure();
        throw toApiError(new StaleProjectStateError(outputOf(latest), input.expectedVersion));
      }
      await store.audit("project_state.update", written);
      return outputOf(written);
    });
  }
}

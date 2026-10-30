import type { SprintCreateInput, SprintOutput } from "@koklo/contract";
import { Inject, Injectable } from "@nestjs/common";
import { conflict, isUniqueViolation, orNotFound, validation } from "../tracker/api-errors.ts";
import type { ProjectScope } from "../tracker/scope.ts";
import {
  SPRINT_REPOSITORY,
  type SprintChanges,
  type SprintRecord,
  type SprintRepository,
  type SprintStatus,
  type SprintStore,
} from "./sprint.repository.ts";

type SprintUpdateFields = Omit<SprintChanges, "status">;

const toOutput = (sprint: SprintRecord): SprintOutput => sprint;

const requireSprint = async (store: SprintStore, key: string): Promise<SprintRecord> =>
  orNotFound(await store.find(key));

/** Cycle de vie du sprint (CDC §7.3) : planned -> active -> closed, sans réouverture. */
@Injectable()
export class SprintService {
  constructor(@Inject(SPRINT_REPOSITORY) private readonly repository: SprintRepository) {}

  create(scope: ProjectScope, input: SprintCreateInput): Promise<SprintOutput> {
    return this.repository.run(scope, async (store) => {
      const sprint = await store.insert({
        number: await store.nextNumber(),
        goal: input.goal,
        startsOn: input.startsOn,
        endsOn: input.endsOn,
        definitionOfDone: input.definitionOfDone ?? "",
      });
      await store.audit("sprint.create", sprint.id);
      return toOutput(sprint);
    });
  }

  get(scope: ProjectScope, key: string): Promise<SprintOutput> {
    return this.repository.run(scope, async (store) => toOutput(await requireSprint(store, key)));
  }

  list(scope: ProjectScope, status?: SprintStatus): Promise<SprintOutput[]> {
    return this.repository.run(scope, async (store) => (await store.list(status)).map(toOutput));
  }

  update(scope: ProjectScope, key: string, fields: SprintUpdateFields): Promise<SprintOutput> {
    return this.repository.run(scope, async (store) => {
      const current = await requireSprint(store, key);
      const startsOn = fields.startsOn ?? current.startsOn;
      const endsOn = fields.endsOn ?? current.endsOn;
      if (endsOn < startsOn) {
        throw validation("endsOn", "endsOn doit suivre startsOn");
      }
      const updated = await store.update(current.id, fields);
      await store.audit("sprint.update", updated.id);
      return toOutput(updated);
    });
  }

  activate(scope: ProjectScope, key: string): Promise<SprintOutput> {
    return this.repository.run(scope, async (store) => {
      const current = await requireSprint(store, key);
      if (current.status !== "planned") {
        throw conflict("sprint_not_planned");
      }
      if (await store.findActive()) {
        throw conflict("sprint_already_active");
      }
      return this.changeStatus(store, current, "active", "sprint.activate");
    });
  }

  close(scope: ProjectScope, key: string): Promise<SprintOutput> {
    return this.repository.run(scope, async (store) => {
      const current = await requireSprint(store, key);
      if (current.status !== "active") {
        throw conflict("sprint_not_active");
      }
      return this.changeStatus(store, current, "closed", "sprint.close");
    });
  }

  private async changeStatus(
    store: SprintStore,
    current: SprintRecord,
    status: SprintStatus,
    action: string,
  ): Promise<SprintOutput> {
    try {
      const updated = await store.update(current.id, { status });
      await store.audit(action, updated.id);
      return toOutput(updated);
    } catch (error) {
      // Deux activations concurrentes : l'index unique partiel départage, le perdant est un conflit.
      if (status === "active" && isUniqueViolation(error)) {
        throw conflict("sprint_already_active");
      }
      throw error;
    }
  }
}

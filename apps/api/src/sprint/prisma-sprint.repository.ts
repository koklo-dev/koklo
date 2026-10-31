import { raiseCounterTo } from "@koklo/db";
import { Inject, Injectable } from "@nestjs/common";
import { recordAudit } from "../tracker/audit.ts";
import { nextCounterValue } from "../tracker/counters.ts";
import { ProjectTransactions, type Tx } from "../tracker/project-transactions.ts";
import type { ProjectScope } from "../tracker/scope.ts";
import type {
  NewSprint,
  SprintChanges,
  SprintRecord,
  SprintRepository,
  SprintStatus,
  SprintStore,
} from "./sprint.repository.ts";

const sprintSelect = {
  id: true,
  key: true,
  goal: true,
  status: true,
  startsOn: true,
  endsOn: true,
  definitionOfDone: true,
} as const;

type SprintRow = {
  id: string;
  key: string;
  goal: string;
  status: SprintStatus;
  startsOn: Date;
  endsOn: Date;
  definitionOfDone: string;
};

const toDay = (date: Date): string => date.toISOString().slice(0, 10);
const fromDay = (day: string): Date => new Date(`${day}T00:00:00.000Z`);

const toRecord = (row: SprintRow): SprintRecord => ({
  ...row,
  startsOn: toDay(row.startsOn),
  endsOn: toDay(row.endsOn),
});

export class PrismaSprintStore implements SprintStore {
  constructor(
    private readonly tx: Tx,
    private readonly scope: ProjectScope,
  ) {}

  nextNumber(): Promise<number> {
    return nextCounterValue(this.tx, this.scope, "sprint");
  }

  raiseCounter(atLeast: number): Promise<void> {
    return raiseCounterTo(this.tx, this.scope, "sprint", atLeast);
  }

  async find(key: string): Promise<SprintRecord | null> {
    const row = await this.tx.sprint.findFirst({
      where: { projectId: this.scope.projectId, key },
      select: sprintSelect,
    });
    return row && toRecord(row);
  }

  async findActive(): Promise<SprintRecord | null> {
    const row = await this.tx.sprint.findFirst({
      where: { projectId: this.scope.projectId, status: "active" },
      select: sprintSelect,
    });
    return row && toRecord(row);
  }

  async list(status?: SprintStatus): Promise<SprintRecord[]> {
    const rows = await this.tx.sprint.findMany({
      where: { projectId: this.scope.projectId, ...(status ? { status } : {}) },
      orderBy: { number: "asc" },
      select: sprintSelect,
    });
    return rows.map(toRecord);
  }

  async insert(sprint: NewSprint): Promise<SprintRecord> {
    const { organizationId, projectId } = this.scope;
    const row = await this.tx.sprint.create({
      data: {
        organizationId,
        projectId,
        number: sprint.number,
        key: `SP-${sprint.number}`,
        goal: sprint.goal,
        startsOn: fromDay(sprint.startsOn),
        endsOn: fromDay(sprint.endsOn),
        definitionOfDone: sprint.definitionOfDone,
        status: "planned",
      },
      select: sprintSelect,
    });
    return toRecord(row);
  }

  async update(id: string, changes: SprintChanges): Promise<SprintRecord> {
    const { startsOn, endsOn, ...rest } = changes;
    // Le projet est dans le filtre : un sprint d'un autre projet n'est jamais modifié.
    const row = await this.tx.sprint.update({
      where: { id, projectId: this.scope.projectId },
      data: {
        ...rest,
        ...(startsOn ? { startsOn: fromDay(startsOn) } : {}),
        ...(endsOn ? { endsOn: fromDay(endsOn) } : {}),
      },
      select: sprintSelect,
    });
    return toRecord(row);
  }

  audit(action: string, sprintId: string): Promise<void> {
    return recordAudit(this.tx, this.scope, { action, targetKind: "sprint", targetId: sprintId });
  }
}

@Injectable()
export class PrismaSprintRepository implements SprintRepository {
  constructor(@Inject(ProjectTransactions) private readonly transactions: ProjectTransactions) {}

  run<T>(scope: ProjectScope, work: (store: SprintStore) => Promise<T>): Promise<T> {
    return this.transactions.run(scope, (tx) => work(new PrismaSprintStore(tx, scope)));
  }
}

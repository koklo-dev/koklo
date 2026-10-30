import { Inject, Injectable } from "@nestjs/common";
import { recordAudit } from "../tracker/audit.ts";
import { ProjectTransactions, type Tx } from "../tracker/project-transactions.ts";
import type { ProjectScope } from "../tracker/scope.ts";
import type {
  ProjectStateRecord,
  ProjectStateRepository,
  ProjectStateStore,
} from "./project-state.repository.ts";

/** Type JSON accepté par Prisma pour la colonne `content`. */
type JsonContent = Parameters<Tx["projectState"]["create"]>[0]["data"]["content"];

const toRecord = (row: { id: string; version: number; content: unknown }): ProjectStateRecord => ({
  id: row.id,
  version: row.version,
  content: row.content as Record<string, unknown>,
});

class PrismaProjectStateStore implements ProjectStateStore {
  constructor(
    private readonly tx: Tx,
    private readonly scope: ProjectScope,
  ) {}

  async ensure(): Promise<ProjectStateRecord> {
    const { organizationId, projectId } = this.scope;
    // ON CONFLICT DO NOTHING : deux premières lectures simultanées ne s'abortent pas (pas de P2002).
    await this.tx.projectState.createMany({
      data: [{ organizationId, projectId, version: 1, content: {} }],
      skipDuplicates: true,
    });
    return toRecord(await this.tx.projectState.findFirstOrThrow({ where: { projectId } }));
  }

  async write(
    expectedVersion: number,
    content: Record<string, unknown>,
  ): Promise<ProjectStateRecord | null> {
    const { projectId } = this.scope;
    const { count } = await this.tx.projectState.updateMany({
      where: { projectId, version: expectedVersion },
      data: { content: content as JsonContent, version: expectedVersion + 1 },
    });
    if (count === 0) {
      return null;
    }
    return toRecord(await this.tx.projectState.findFirstOrThrow({ where: { projectId } }));
  }

  audit(action: string, state: ProjectStateRecord): Promise<void> {
    return recordAudit(this.tx, this.scope, {
      action,
      targetKind: "project_state",
      targetId: state.id,
    });
  }
}

@Injectable()
export class PrismaProjectStateRepository implements ProjectStateRepository {
  constructor(@Inject(ProjectTransactions) private readonly transactions: ProjectTransactions) {}

  run<T>(scope: ProjectScope, work: (store: ProjectStateStore) => Promise<T>): Promise<T> {
    return this.transactions.run(scope, (tx) => work(new PrismaProjectStateStore(tx, scope)));
  }
}

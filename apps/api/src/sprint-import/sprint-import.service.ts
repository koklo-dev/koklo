import { Inject, Injectable } from "@nestjs/common";
import { MANAGER_ROLES } from "../auth/roles.ts";
import { DatabaseService } from "../database/database.module.ts";
import type { ProjectScope } from "../tracker/scope.ts";
import { SprintImportUsageError } from "./import-errors.ts";
import { type ImportOptions, ImportRun } from "./import-run.ts";
import { parseSprintFile } from "./parse-sprint-file.ts";
import type { SprintSource } from "./read-sprint-directory.ts";
import type { ImportReport } from "./report.ts";
import {
  SPRINT_IMPORT_REPOSITORY,
  type SprintImportRepository,
} from "./sprint-import.repository.ts";

/** Signal interne : le mode essai annule la transaction après avoir calculé le rapport complet. */
class DryRunRollback extends Error {}

/**
 * Commande d'administration (jamais une route) : importe des fichiers de sprint Shipyard en sprints
 * et tickets (CDC §7.7). Les écritures passent par les ports, transactions et audit des modules
 * tickets et sprints ; les dépendances sont validées par le domaine.
 */
@Injectable()
export class SprintImportService {
  constructor(
    @Inject(SPRINT_IMPORT_REPOSITORY) private readonly repository: SprintImportRepository,
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}

  /** L'acteur doit être owner ou admin de l'organisation (`members` est hors filtre tenant). */
  async assertCanImport(scope: ProjectScope): Promise<void> {
    const member = await this.database.raw.member.findFirst({
      where: { organizationId: scope.organizationId, userId: scope.userId },
      select: { role: true },
    });
    const roles = (member?.role ?? "").split(",").map((role) => role.trim());
    if (!roles.some((role) => (MANAGER_ROLES as readonly string[]).includes(role))) {
      throw new SprintImportUsageError("l'acteur doit être owner ou admin de l'organisation");
    }
  }

  async run(
    scope: ProjectScope,
    sources: readonly SprintSource[],
    options: ImportOptions,
  ): Promise<ImportReport> {
    await this.assertCanImport(scope);
    const parsed = sources.map((source) => parseSprintFile(source.fileName, source.text));
    let run: ImportRun | undefined;
    try {
      await this.repository.run(scope, async (stores) => {
        run = new ImportRun(stores, options);
        await run.execute(parsed);
        if (options.dryRun) throw new DryRunRollback();
      });
    } catch (error) {
      if (!(error instanceof DryRunRollback)) throw error;
    }
    if (!run) throw new Error("import interrompu avant son démarrage");
    return run.report(parsed, options.dryRun);
  }
}

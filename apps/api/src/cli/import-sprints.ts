import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ORPCError } from "@orpc/server";
import { AppModule } from "../app.module.ts";
import { type AppConfig, loadConfig } from "../config.ts";
import { SprintImportUsageError } from "../sprint-import/import-errors.ts";
import {
  readSprintDirectory,
  type SprintDirectory,
  SprintImportPathError,
} from "../sprint-import/read-sprint-directory.ts";
import type { ImportReport } from "../sprint-import/report.ts";
import { SprintImportService } from "../sprint-import/sprint-import.service.ts";
import { type ImportArgs, parseImportArgs } from "./import-args.ts";
import { formatReport } from "./import-output.ts";

export interface CliIo {
  env: Record<string, string | undefined>;
  /** Date du jour `AAAA-MM-JJ` (injectée : les tests ne dépendent pas de l'horloge). */
  today: () => string;
  stdout: (text: string) => void;
  stderr: (text: string) => void;
}

/** Codes de sortie : 0 import sans erreur, 1 rapport avec erreur ou conflit (ou échec technique), 2 refus. */
const EXIT = { ok: 0, failed: 1, refused: 2 } as const;

function redact(message: string, config: AppConfig | null): string {
  const secrets = config
    ? [config.databaseUrl, config.betterAuthSecret, config.githubClientSecret, config.sentryDsn]
    : [];
  return secrets.reduce<string>(
    (text, secret) => (secret ? text.split(secret).join("***") : text),
    message,
  );
}

async function importInto(
  config: AppConfig,
  args: ImportArgs,
  source: SprintDirectory,
): Promise<ImportReport> {
  const app = await NestFactory.createApplicationContext(AppModule.forRoot(config), {
    logger: false,
  });
  try {
    return await app
      .get(SprintImportService)
      .run(
        { organizationId: args.organizationId, projectId: args.projectId, userId: args.actorId },
        source.sources,
        { dryRun: args.dryRun, startsOn: args.startsOn, endsOn: args.endsOn },
      );
  } finally {
    await app.close();
  }
}

async function execute(argv: readonly string[], io: CliIo, held: { config: AppConfig | null }) {
  const args = parseImportArgs(argv, io.today);
  held.config = loadConfig(io.env);
  const source = await readSprintDirectory(args.directory);
  if (source.sources.length === 0) {
    throw new SprintImportUsageError("aucun fichier sprint-NNN.md dans le répertoire");
  }
  const report = await importInto(held.config, args, source);
  io.stdout(args.json ? `${JSON.stringify(report, null, 2)}\n` : formatReport(report, source));
  return report.ok ? EXIT.ok : EXIT.failed;
}

/**
 * Commande d'administration `import sprints` (CDC §7.7) : jamais exposée en HTTP. Le rapport va sur
 * la sortie standard, les refus sur l'erreur standard (sans URL de base ni secret).
 */
export async function runImportSprints(argv: readonly string[], io: CliIo): Promise<number> {
  const held: { config: AppConfig | null } = { config: null };
  try {
    return await execute(argv, io, held);
  } catch (error) {
    if (error instanceof SprintImportUsageError || error instanceof SprintImportPathError) {
      io.stderr(`${error.message}\n`);
      return EXIT.refused;
    }
    if (error instanceof ORPCError && error.code === "NOT_FOUND") {
      io.stderr("projet introuvable dans cette organisation\n");
      return EXIT.refused;
    }
    const message = error instanceof Error ? error.message : String(error);
    io.stderr(`${redact(message, held.config)}\n`);
    return held.config ? EXIT.failed : EXIT.refused;
  }
}

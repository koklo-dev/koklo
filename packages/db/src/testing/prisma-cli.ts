import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const migrationsDir = join(packageRoot, "prisma", "migrations");
export const schemaPath = join(packageRoot, "prisma", "schema.prisma");

export const expectedTables = [
  "users",
  "sessions",
  "accounts",
  "verifications",
  "organizations",
  "members",
  "invitations",
  "projects",
  "tickets",
  "ticket_labels",
  "ticket_features",
  "acceptance_criteria",
  "ticket_dependencies",
  "sprints",
  "project_states",
  "leases",
  "ticket_comments",
  "audit_log",
  "project_counters",
  // TK-41 : installations, repos, index de spec, lots d'écriture, journal de webhooks.
  "provider_installations",
  "project_repos",
  "spec_snapshots",
  "spec_heads",
  "spec_features",
  "spec_criteria",
  "spec_tables",
  "spec_endpoints",
  "spec_feature_tables",
  "spec_feature_endpoints",
  "spec_write_batches",
  "spec_write_operations",
  "webhook_deliveries",
  // TK-48a1 : états d'installation à usage unique, jetons utilisateur chiffrés.
  "provider_auth_states",
  "provider_user_credentials",
  // TK-51a : identifiants BYOK chiffrés (un par organisation et fournisseur).
  "llm_provider_credentials",
  // TK-51b : propositions client `SG-n`.
  "suggestions",
  // TK-51c : validations client liées au SHA (journal append-only) et baselines.
  "reviews",
  "baselines",
  // TK-51d : notifications in-app (destinataire membre, sans charge utile libre).
  "notifications",
] as const;

/** Tables à clé primaire composite : pas d'`id` uuid (§18.1). */
export const compositeKeyTables: readonly string[] = [
  "ticket_labels",
  "ticket_features",
  "ticket_dependencies",
  "project_counters",
  "spec_heads",
  "spec_feature_tables",
  "spec_feature_endpoints",
];

/** Tables sans `created_at`/`updated_at` obligatoires : liaisons à clé composite et `audit_log` (jamais modifiée). */
export const stampExemptTables: readonly string[] = [...compositeKeyTables, "audit_log"];

export interface CliResult {
  status: number | null;
  output: string;
}

/** Exécute la CLI Prisma du paquet contre `databaseUrl` (jamais d'autre base). */
export function runPrisma(args: string[], databaseUrl: string): CliResult {
  const bin = join(packageRoot, "node_modules", ".bin", "prisma");
  const result = spawnSync(bin, args, {
    cwd: packageRoot,
    encoding: "utf8",
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });
  return { status: result.status, output: `${result.stdout}\n${result.stderr}` };
}

/** Comme `runPrisma` mais lève une erreur portant la sortie complète si le code est non nul. */
export function runPrismaOrThrow(args: string[], databaseUrl: string): string {
  const { status, output } = runPrisma(args, databaseUrl);
  if (status !== 0) {
    throw new Error(`prisma ${args.join(" ")} a échoué (code ${status})\n${output}`);
  }
  return output;
}

/** Noms des dossiers de migration, triés (ordre d'application). */
export function listMigrationDirs(): string[] {
  if (!existsSync(migrationsDir)) {
    throw new Error(`Dossier de migrations absent : ${migrationsDir}`);
  }
  return readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

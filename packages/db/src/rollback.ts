import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

/** Effets de bord du rollback, injectés pour pouvoir tester la logique sans base. */
export interface RollbackPorts {
  /** Exécute le fichier SQL sur la base cible (échoue en cas d'erreur). */
  runSqlFile: (file: string) => void;
  /** Retire la ligne de `_prisma_migrations`, pour que `migrate deploy` puisse ré-appliquer. */
  forgetMigration: (name: string) => Promise<void>;
}

/** Nom du dossier de la dernière migration (ordre d'application = ordre lexical). */
export function latestMigration(migrationsDir: string): string {
  if (!existsSync(migrationsDir)) {
    throw new Error(`Dossier de migrations absent : ${migrationsDir}`);
  }
  const latest = readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .at(-1);
  if (!latest) {
    throw new Error("Aucune migration à annuler");
  }
  if (!existsSync(join(migrationsDir, latest, "down.sql"))) {
    throw new Error(`down.sql manquant pour la migration ${latest}`);
  }
  return latest;
}

/** Annule la dernière migration via son `down.sql` et retourne son nom. */
export async function rollbackLatest(migrationsDir: string, ports: RollbackPorts): Promise<string> {
  const name = latestMigration(migrationsDir);
  ports.runSqlFile(join(migrationsDir, name, "down.sql"));
  await ports.forgetMigration(name);
  return name;
}

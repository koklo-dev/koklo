import type { SprintDirectory } from "../sprint-import/read-sprint-directory.ts";
import type { ImportReport } from "../sprint-import/report.ts";

const plural = (n: number, word: string): string => `${n} ${word}`;

function totalsBlock(report: ImportReport): string[] {
  const entries = Object.entries(report.totalsByCode).sort(([a], [b]) => a.localeCompare(b));
  return entries.map(([code, count]) => `  ${code} : ${count}`);
}

function detailBlock(report: ImportReport): string[] {
  return report.lines
    .filter((line) => line.severity !== "ignored")
    .map(
      (l) =>
        `  [${l.severity}] ${l.file}:${l.line} ${l.code}${l.key ? ` ${l.key}` : ""} — ${l.text}`,
    );
}

/** Rapport lisible : chemin, comptes, totaux par code, puis chaque avertissement et erreur. */
export function formatReport(report: ImportReport, source: SprintDirectory): string {
  const { sprints, tickets, dependencies } = report;
  const lines = [
    `Import des sprints Shipyard${report.dryRun ? " (essai, rien n'est écrit)" : ""}`,
    `Répertoire : ${source.directory}`,
    `Fichiers lus : ${report.files}${source.skipped.length > 0 ? ` ; non lus : ${source.skipped.map((s) => s.name).join(", ")}` : ""}`,
    `Sprints : ${plural(sprints.created, "créé(s)")}, ${plural(sprints.matched, "apparié(s)")}, ${plural(sprints.conflicts, "en conflit")}`,
    `Tickets : ${plural(tickets.created, "créé(s)")}, ${plural(tickets.matched, "apparié(s)")}, ${plural(tickets.conflicts, "en conflit")}, ${plural(tickets.rejected, "rejeté(s)")}`,
    `Dépendances : ${plural(dependencies.created, "créée(s)")}, ${plural(dependencies.present, "déjà présente(s)")}, ${plural(dependencies.rejected, "rejetée(s)")}`,
    "Lignes non importées, totaux par code (liste complète avec --json) :",
    ...totalsBlock(report),
  ];
  const details = detailBlock(report);
  if (details.length > 0) lines.push("Avertissements et erreurs :", ...details);
  lines.push(report.ok ? "Résultat : OK" : "Résultat : ÉCHEC (erreurs ou conflits ci-dessus)");
  return `${lines.join("\n")}\n`;
}

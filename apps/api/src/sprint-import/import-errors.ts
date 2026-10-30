/** Usage invalide ou acteur non autorisé : rien n'a été écrit (code de sortie 2 du CLI). */
export class SprintImportUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SprintImportUsageError";
  }
}

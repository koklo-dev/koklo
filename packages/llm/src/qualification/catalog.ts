import { AI_USAGES, type QualifiedModel } from "@koklo/domain";
import type { QualificationReport } from "./run.ts";

/** Catalogue des modèles qualifiés : un modèle n'y figure que pour les usages réussis. */
export const buildCatalog = (
  entries: readonly { readonly report: QualificationReport; readonly economy: boolean }[],
): QualifiedModel[] =>
  entries.flatMap(({ report, economy }) => {
    const usages = AI_USAGES.filter((usage) => report.usages[usage].qualified);
    return usages.length === 0
      ? []
      : [{ provider: report.provider, model: report.model, usages, economy }];
  });

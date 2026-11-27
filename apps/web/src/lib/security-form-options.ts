import type { ThreatDetail } from "@koklo/contract";
import { SEVERITY_LABELS, THREAT_CATEGORY_LABELS, VERIFICATION_LABELS } from "./security-labels.ts";

const optionsOf = <K extends string>(labels: Record<K, string>) =>
  (Object.entries(labels) as Array<[K, string]>).map(([value, label]) => ({ value, label }));

/** Pastilles à choix de la feuille « Menace » (maquette 15 l.708). */
export const THREAT_FORM_OPTIONS = {
  category: optionsOf<ThreatDetail["category"]>(THREAT_CATEGORY_LABELS),
  severity: optionsOf<ThreatDetail["severity"]>(SEVERITY_LABELS),
  verification: optionsOf<ThreatDetail["verification"]>(VERIFICATION_LABELS),
};

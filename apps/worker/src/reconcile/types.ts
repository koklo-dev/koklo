/** Bilan d'une passe : lignes ré-enfilées, lignes laissées (job vivant, charge illisible, enfilage refusé). */
export interface PassCount {
  requeued: number;
  skipped: number;
}

export const PASS_NAMES = ["deliveries", "batches"] as const;
export type PassName = (typeof PASS_NAMES)[number];

/** Une passe de réparation, indépendante des autres : sa panne ne doit pas arrêter le tick. */
export type ReconcilePass = () => Promise<PassCount>;

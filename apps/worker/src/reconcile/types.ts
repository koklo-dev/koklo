/** Bilan d'une passe : lignes ré-enfilées, lignes laissées (job vivant, charge illisible, enfilage refusé). */
export interface PassCount {
  requeued: number;
  skipped: number;
}

/** Bilan de P3 : tickets passés `done`, PR fermées sans fusion, tickets laissés (par motif). */
export interface PullRequestCount {
  done: number;
  closed: number;
  skipped: number;
  reasons: Record<string, number>;
}

/** Bilan vide de P3 (neuf à chaque appel : `reasons` est mutable). */
export const emptyPullRequestCount = (): PullRequestCount => ({
  done: 0,
  closed: 0,
  skipped: 0,
  reasons: {},
});

export const PASS_NAMES = ["deliveries", "batches", "prs"] as const;
export type PassName = (typeof PASS_NAMES)[number];

/** Les passes de réparation, indépendantes : la panne de l'une ne doit pas arrêter le tick. */
export interface ReconcilePasses {
  readonly deliveries: () => Promise<PassCount>;
  readonly batches: () => Promise<PassCount>;
  readonly prs: () => Promise<PullRequestCount>;
}

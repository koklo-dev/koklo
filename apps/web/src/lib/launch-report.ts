import type { LaunchReport, ProposalListOutput } from "@koklo/contract";

type Launch = NonNullable<ProposalListOutput["launch"]>;
type Count = { covered: number; total: number };

/** Libellés des motifs de zone écartée (DESIGN §5.25, B619) : jamais le texte du fournisseur. */
const DISCARD_LABELS: Record<LaunchReport["discardReasons"][number]["reason"], string> = {
  truncated: "réponse coupée",
  output_invalid: "réponse invalide",
  prompt_rejected: "consigne refusée",
  refused: "refus du modèle",
};

const STOP_LABELS: Record<NonNullable<LaunchReport["stopReason"]>, string> = {
  completed: "terminé",
  cap: "arrêté au plafond",
  deadline: "arrêté au délai",
  cancelled: "annulé",
};

const ACTIVE = new Set(["queued", "running"]);
const ratio = ({ covered, total }: Count): string => `${covered}/${total}`;

/** « Zones traitées N/M · écartées K » puis la couverture des fonctionnalités, après ou, à défaut, avant le lancement. */
function summaryOf(report: LaunchReport, prefix: string): string {
  const processed = report.zonesDone + report.zonesDiscarded;
  const coverage = (report.coverageAfter ?? report.coverageBefore)?.features;
  return [
    `${prefix} ${processed}/${report.zonesRequested}`,
    `écartées ${report.zonesDiscarded}`,
    ...(coverage ? [`couverture ${ratio(coverage)}`] : []),
  ].join(" · ");
}

/** Ligne de détail du bandeau de génération (S-spec-architecture §13) ; `undefined` sans bilan. */
export function launchDetailOf(launch: Launch | null | undefined): string | undefined {
  const report = launch?.report;
  if (!report) return undefined;
  if (report.zonesRequested === 0) return "Préparation des zones";
  return summaryOf(report, "Zones traitées");
}

/** Motif d'arrêt affiché : celui du bilan, sinon déduit du statut (échec sans motif : interrompu). */
function stopLabelOf(launch: Launch, report: LaunchReport): string {
  if (report.stopReason) return STOP_LABELS[report.stopReason];
  if (launch.status === "canceled") return STOP_LABELS.cancelled;
  return launch.status === "failed" ? "interrompu" : STOP_LABELS.completed;
}

/** Lancement d'avant TK-114b : colonnes à leur valeur de départ, rien à dire. */
const isEmpty = (report: LaunchReport): boolean =>
  report.zonesRequested === 0 &&
  report.discardReasons.length === 0 &&
  !report.coverageAfter &&
  !report.stopReason;

function coverageLine(report: LaunchReport): string[] {
  const after = report.coverageAfter;
  if (!after) return [];
  const before = report.coverageBefore;
  const parts = [
    `Fonctionnalités servies ${ratio(after.features)}`,
    `parcours détaillés ${ratio(after.flows)}`,
    `tables rattachées ${ratio(after.tables)}`,
    ...(before
      ? [`avant : ${[before.features, before.flows, before.tables].map(ratio).join(", ")}`]
      : []),
  ];
  return [parts.join(" · ")];
}

function discardLine(report: LaunchReport): string[] {
  if (report.discardReasons.length === 0) return [];
  const parts = report.discardReasons.map(
    ({ reason, count }) => `${DISCARD_LABELS[reason]} (${count})`,
  );
  return [`Zones écartées : ${parts.join(", ")}`];
}

export interface LaunchReportView {
  variant: "neutral" | "warning";
  icon: "info" | "warning";
  lines: string[];
}

/** Bilan de la Relecture (DESIGN §5.25) : lancement fini seulement ; neutre si terminé, avertissement sinon. */
export function launchReportOf(launch: Launch | null | undefined): LaunchReportView | null {
  const report = launch?.report;
  if (!launch || !report || ACTIVE.has(launch.status) || isEmpty(report)) return null;
  const stop = stopLabelOf(launch, report);
  const done = stop === STOP_LABELS.completed;
  return {
    variant: done ? "neutral" : "warning",
    icon: done ? "info" : "warning",
    lines: [
      `${summaryOf(report, "Bilan du lancement · zones traitées")} · ${stop}`,
      ...coverageLine(report),
      ...discardLine(report),
    ],
  };
}

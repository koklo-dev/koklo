import type { LaunchReport, ProposalListOutput } from "@koklo/contract";

type Launch = NonNullable<ProposalListOutput["launch"]>;
type Count = { covered: number; total: number };
type Coverage = NonNullable<LaunchReport["coverageAfter"]>;
type RepriseSkip = NonNullable<NonNullable<Coverage["reprises"]>["skipped"]>[number];

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

/** Motifs d'un flux direct non repris (B655, B661). */
const SKIP_LABELS: Record<RepriseSkip["reason"], string> = {
  too_long: "trop long",
  no_entry_app: "sans application d'entrée",
  cap: "au-delà du plafond",
};

const ACTIVE = new Set(["queued", "running"]);
const ratio = ({ covered, total }: Count): string => `${covered}/${total}`;

const currentOf = (report: LaunchReport): Coverage | undefined =>
  report.coverageAfter ?? report.coverageBefore;

/** « rôles avec application X/Y · flux repris A/B » (B661) ; rien pour un lancement d'avant TK-114d (sans `roles`). */
function rolesParts(coverage: Coverage | undefined, capital = false): string[] {
  if (!coverage?.roles) return [];
  const { roles, reprises } = coverage;
  return [
    `${capital ? "Rôles" : "rôles"} avec application ${ratio(roles)}`,
    ...(reprises ? [`flux repris ${ratio(reprises)}`] : []),
  ];
}

/** « Zones traitées N/M · écartées K » puis la couverture des fonctionnalités, après ou, à défaut, avant le lancement. */
function summaryOf(report: LaunchReport, prefix: string): string {
  const processed = report.zonesDone + report.zonesDiscarded;
  const coverage = currentOf(report)?.features;
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
  return [summaryOf(report, "Zones traitées"), ...rolesParts(currentOf(report))].join(" · ");
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

/** Couverture d'avant le lancement : composants reliés (B642) seulement s'ils ont été comptés. */
const beforeCounts = (before: NonNullable<LaunchReport["coverageBefore"]>) => [
  before.features,
  before.flows,
  before.tables,
  ...(before.links ? [before.links] : []),
];

/** « sections déjà présentes écartées : n » (B670) : seulement quand n ≥ 1 ; seul sur sa ligne sans couverture. */
const sectionsPart = (report: LaunchReport, capital = false): string[] =>
  report.sectionsExisting
    ? [`${capital ? "Sections" : "sections"} déjà présentes écartées : ${report.sectionsExisting}`]
    : [];

function coverageLine(report: LaunchReport): string[] {
  const after = report.coverageAfter;
  if (!after) return sectionsPart(report, true);
  const before = report.coverageBefore;
  const parts = [
    `Fonctionnalités servies ${ratio(after.features)}`,
    `parcours détaillés ${ratio(after.flows)}`,
    `tables rattachées ${ratio(after.tables)}`,
    ...(after.links ? [`composants reliés ${ratio(after.links)}`] : []),
    ...(before ? [`avant : ${beforeCounts(before).map(ratio).join(", ")}`] : []),
    ...sectionsPart(report),
  ];
  return [parts.join(" · ")];
}

/** « Rôles avec application X/Y · flux repris A/B · avant : x/Y » puis les motifs des flux non repris (B661). */
function rolesLine(report: LaunchReport): string[] {
  const after = report.coverageAfter;
  const parts = rolesParts(after, true);
  if (parts.length === 0) return [];
  const before = report.coverageBefore?.roles;
  const skipped = after?.reprises?.skipped ?? [];
  const reasons = skipped.map(({ reason, count }) => `${SKIP_LABELS[reason]} (${count})`);
  return [
    [
      ...parts,
      ...(before ? [`avant : ${ratio(before)}`] : []),
      ...(reasons.length > 0 ? [`non repris : ${reasons.join(", ")}`] : []),
    ].join(" · "),
  ];
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
      ...rolesLine(report),
      ...discardLine(report),
    ],
  };
}

import type { ProjectOverview } from "@koklo/contract";
import type { DeliverableStatusValue, IconName, SpecKey, TicketStatusValue } from "@koklo/ui";
import { SPEC_DELIVERABLES } from "@koklo/ui";

type Overview = ProjectOverview;
export type OverviewMain = Overview["main"];
export type OverviewDeliverable = Extract<OverviewMain, { kind: "deliverables" }>["items"][number];

/** Noms des sept livrables sur les cartes (maquette 07 l.338-346) ; l'icône est celle de la barre (`SPEC_DELIVERABLES`). */
export const DELIVERABLE_TITLES: Record<SpecKey, string> = {
  functional: "Cahier fonctionnel",
  data: "Modèle de données",
  architecture: "Architecture",
  technical: "Cahier technique",
  security: "Sécurité",
  design: "Design",
  quality: "Qualité",
};

export const deliverableIcon = (key: SpecKey): IconName =>
  SPEC_DELIVERABLES.find((deliverable) => deliverable.key === key)?.icon ?? "description";

/** Icône d'un indicateur : le serveur écrit le nom, le registre fermé de l'interface décide (repli : `info`). */
const STAT_ICONS: ReadonlySet<string> = new Set<IconName>([
  "lightbulb",
  "rate_review",
  "forum",
  "cloud_done",
  "inventory_2",
  "person",
  "chat_bubble",
  "commit",
  "flag",
  "smart_toy",
  "call_split",
  "check_circle",
]);
export const statIcon = (name: string): IconName =>
  STAT_ICONS.has(name) ? (name as IconName) : "info";

/** Statuts de ticket du contrat vers les quatre de la liste (maquette 07 l.161) : le reste se lit « À faire ». */
export function ticketStatusOf(status: string): TicketStatusValue {
  return status === "in_review" || status === "in_progress" || status === "done" ? status : "todo";
}

export const deliverableStatusOf = (
  status: OverviewDeliverable["status"],
): DeliverableStatusValue => status;

const SHORT_DATE = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" });

/** « 14 oct. » ; le point de l'abréviation est celui du français (« nov. »). */
export const shortDate = (iso: string): string => SHORT_DATE.format(new Date(iso));

/** Résumé de l'en-tête : « Client : Marie Lefèvre · démarré le 14 oct. » (le contact n'est servi qu'à l'équipe). */
export function summaryOf(project: Overview["project"]): string {
  const started = shortDate(project.startedAt);
  return project.clientContact
    ? `Client : ${project.clientContact} · démarré le ${started}`
    : `Démarré le ${started}`;
}

/** Adresse absolue d'un lien relatif du serveur, pour « Relancer » (le client l'ouvre hors de l'application). */
export const absoluteLink = (href: string, origin: string): string => new URL(href, origin).href;

/** Pied de la liste Idée et Itérations (maquette 07 l.165) : le lien n'existe que pour l'équipe. */
export const LIST_FOOTER =
  "Les 5 éléments les plus urgents · la liste complète est dans le lien ci-dessus";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Date d'un événement : relative jusqu'à une semaine (« il y a 5 minutes »), puis « 3 nov. ». */
export function whenOf(iso: string, now: number, relative: (iso: string, now: number) => string) {
  return now - new Date(iso).getTime() < WEEK_MS ? relative(iso, now) : shortDate(iso);
}

/** Pied de la colonne Personnes quand la liste est tronquée à 5. */
export const othersLabel = (count: number): string =>
  `et ${count} ${count === 1 ? "autre personne" : "autres personnes"}`;

import type { IncomingMessage } from "node:http";

/**
 * Faux API de la vue d'ensemble (TK-92, contrat 2.7.0) : `project.overview` et `project.activity`, sans Postgres.
 * Pilotage : `overview` (réponse servie). Le contenu est celui que le serveur construit (phrases en français) ;
 * l'écran n'en assemble aucune. Projet inconnu : NOT_FOUND, comme l'API réelle.
 */
export type OverviewMode =
  | "idea"
  | "framing"
  | "iterations"
  | "new"
  | "neutral"
  | "noSprint"
  | "client"
  | "error"
  | "loading";
export type OverviewScenario = { overview?: OverviewMode };

type Reply = { status: number; body: string };
type Send = (reply: Reply) => void;
const reply = (status: number, body: unknown): Reply => ({ status, body: JSON.stringify(body) });

const ROUTE = /^\/projects\/([^/]+)\/(overview|activity)$/;
export const OVERVIEW_PROJECT_ID = "7d1f6c1e-0b0a-4c55-9d63-1d2f7d6a1b01";
const P = OVERVIEW_PROJECT_ID;
const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

const KEYS = ["functional", "data", "architecture", "technical", "security", "design", "quality"];
const SOON = {
  status: "todo",
  content: "Bientôt disponible",
  progressLabel: "À faire",
  validator: "team",
  validatorLabel: "Validation de l'équipe · le client lit et commente",
  available: false,
};
const deliverables = KEYS.map((key) =>
  key === "functional"
    ? {
        key,
        status: "pending",
        content: "7 fonctionnalités",
        done: 4,
        total: 7,
        progressLabel: "4 fonctionnalités validées sur 7",
        validator: "client",
        validatorLabel: "Validation client · obligatoire",
        available: true,
        href: `/projects/${P}/spec/functional`,
      }
    : { key, ...SOON },
);

const STEPS = ["idea", "framing", "baseline", "iterations"];
/** Sous-titres du fil, mêmes textes que le serveur (`overview-texts.ts`), pour la phase 0 (Idée), 1 (Cadrage) ou 3 (Itérations). */
const SUBTITLES: Record<number, string[]> = {
  0: [
    "Dossier en cours, 5 pages stables sur 10",
    "Après le dossier d'idée",
    "Posée à la validation du client",
    "Sprints et demandes de changement",
  ],
  1: [
    "Version idea-v1 figée le 3 nov.",
    "2 livrables validés sur 7",
    "Posée à la validation du client",
    "Sprints et demandes de changement",
  ],
  3: [
    "Version idea-v1 figée le 3 nov.",
    "7 livrables validés",
    "Posée le 12 nov.",
    "Sprint SP-7 en cours",
  ],
};
const steps = (current: 0 | 1 | 3) =>
  STEPS.map((key, index) => ({
    key,
    status: index < current ? "done" : index === current ? "current" : "todo",
    subtitle: SUBTITLES[current]?.[index],
  }));

const activityItem = (kind: string, name: string, initials: string, text: string, at: string) => ({
  actor: { kind, name, initials },
  text,
  at,
});
const ACTIVITY = [
  activityItem(
    "client",
    "Marie Lefèvre",
    "ML",
    "Marie a validé F-001 Réserver un créneau",
    minutesAgo(5),
  ),
  activityItem(
    "agent",
    "Assistant",
    "IA",
    "L'agent a proposé 7 fonctionnalités depuis le dossier",
    minutesAgo(26 * 60),
  ),
  activityItem(
    "team",
    "Awa Koné",
    "AK",
    "Awa a marqué 00 · Vision comme stable",
    "2026-11-01T10:00:00.000Z",
  ),
  activityItem(
    "team",
    "Awa Koné",
    "AK",
    "Awa a ajouté le critère AC-3 à F-001",
    "2026-11-01T09:00:00.000Z",
  ),
  activityItem(
    "client",
    "Marie Lefèvre",
    "ML",
    "Marie a répondu à 3 questions sur le périmètre",
    "2026-10-30T09:00:00.000Z",
  ),
];

const PEOPLE = {
  items: [
    { name: "Marie Lefèvre", initials: "ML", role: "Client · valide le cadrage", kind: "client" },
    { name: "Awa Koné", initials: "AK", role: "Propriétaire", kind: "team" },
    { name: "Moussa Diallo", initials: "MD", role: "Développeur", kind: "team" },
  ],
  others: 0,
};

const ideaPages = [
  { position: 0, title: "Vision", note: "Stable · Awa", status: "stable" },
  { position: 2, title: "Utilisateurs", note: "1 proposition de l'agent", status: "review" },
  { position: 5, title: "Périmètre", note: "Modifié par Marie il y a 5 min", status: "draft" },
  { position: 7, title: "Mesure", note: "Aucun indicateur de succès", status: "empty" },
];
const sprint = {
  kind: "sprint",
  sprint: { key: "SP-7", goal: "Rendre la réservation fiable" },
  tickets: [
    {
      key: "TK-104",
      title: "Déplacer une réservation",
      note: "PR #42 · agent · CI verte",
      status: "in_review",
    },
    {
      key: "TK-106",
      title: "Agenda du personnel",
      note: "Session d'agent en cours",
      status: "in_progress",
    },
    { key: "TK-101", title: "Créneaux par service", note: "Fusionné hier", status: "done" },
    { key: "TK-107", title: "Export des réservations", note: "Non commencé", status: "todo" },
  ],
};

const base = {
  project: {
    id: P,
    name: "Atelier Lumière",
    startedAt: "2026-10-14T09:00:00.000Z",
    clientContact: "Marie Lefèvre",
  },
  audience: "team",
  canInvite: true,
  activity: { items: ACTIVITY, total: 214 },
  people: PEOPLE,
};

const next = (rule: string, tone: string, title: string, body: string, action?: object) => ({
  rule,
  tone,
  title,
  body,
  ...(action ? { action } : {}),
});

const PHASES: Record<Exclude<OverviewMode, "error" | "loading">, () => object> = {
  idea: () => ({
    ...base,
    phase: "idea",
    phaseSteps: steps(0),
    primaryAction: { label: "Ouvrir l'espace Idée", href: `/projects/${P}/idea` },
    nextAction: next(
      "proposals",
      "warning",
      "2 propositions à relire",
      "Pages 02 · Utilisateurs et 05 · Périmètre.",
      {
        label: "Relire",
        href: `/projects/${P}/idea`,
        kind: "link",
      },
    ),
    stats: [
      {
        key: "maturity",
        icon: "lightbulb",
        label: "Maturité du dossier",
        value: "5 sur 10",
        gauge: { done: 5, total: 10 },
        note: "pages stables",
      },
      {
        key: "proposals",
        icon: "rate_review",
        label: "Propositions à relire",
        value: "2",
        note: "de l'agent, depuis hier",
      },
      {
        key: "exchanges",
        icon: "forum",
        label: "Échanges avec le client",
        value: "14",
        note: "messages cette semaine",
      },
      {
        key: "version",
        icon: "cloud_done",
        label: "Dernière version",
        value: "hier",
        note: "publiée dans le dépôt de spec",
      },
    ],
    main: { kind: "idea", pages: ideaPages },
  }),
  framing: () => ({
    ...base,
    phase: "framing",
    phaseSteps: steps(1),
    primaryAction: { label: "Continuer le cadrage", href: `/projects/${P}/spec/functional` },
    nextAction: next(
      "client_waiting",
      "warning",
      "Le cahier fonctionnel attend la validation de Marie",
      "2 fonctionnalités en attente depuis 3 jours.",
      {
        label: "Relancer Marie",
        href: `/projects/${P}/spec/functional`,
        kind: "copy_link",
      },
    ),
    stats: [
      {
        key: "deliverables",
        icon: "inventory_2",
        label: "Livrables validés",
        value: "0 sur 7",
        gauge: { done: 0, total: 7 },
        note: "aucun pour l'instant",
      },
      {
        key: "validations",
        icon: "person",
        label: "Validations client attendues",
        value: "1",
        note: "fonctionnel",
      },
      {
        key: "suggestions",
        icon: "chat_bubble",
        label: "Suggestions du client",
        value: "1",
        note: "SG-3 · connexion avec Google",
      },
      {
        key: "spec_version",
        icon: "commit",
        label: "Version de la spec",
        value: "a1b2c3d",
        note: "12 versions depuis le début",
      },
    ],
    main: { kind: "deliverables", items: deliverables },
  }),
  iterations: () => ({
    ...base,
    phase: "iterations",
    phaseSteps: steps(3),
    primaryAction: { label: "Ouvrir les tickets", href: `/projects/${P}/tickets` },
    nextAction: next(
      "reviews",
      "warning",
      "1 ticket attend une revue de code",
      "Sprint SP-7 · se termine dans 3 jours.",
      {
        label: "Ouvrir les tickets",
        href: `/projects/${P}/tickets`,
        kind: "link",
      },
    ),
    stats: [
      {
        key: "sprint",
        icon: "flag",
        label: "Sprint SP-7",
        value: "1 sur 4",
        gauge: { done: 1, total: 4 },
        note: "tickets terminés",
      },
    ],
    main: sprint,
  }),
  new: () => ({
    ...base,
    phase: "idea",
    phaseSteps: steps(0),
    primaryAction: { label: "Ouvrir l'espace Idée", href: `/projects/${P}/idea` },
    nextAction: next(
      "start",
      "warning",
      "Commencez le dossier d'idée",
      "Rien n'est encore écrit.",
      {
        label: "Ouvrir l'espace Idée",
        href: `/projects/${P}/idea`,
        kind: "link",
      },
    ),
    stats: [],
    main: { kind: "idea", pages: [] },
    project: { ...base.project, clientContact: undefined },
    activity: {
      items: [
        activityItem("team", "Awa Koné", "AK", "Le projet vient d'être créé.", minutesAgo(3)),
      ],
      total: 1,
    },
    people: { items: [PEOPLE.items[1]], others: 0 },
  }),
  neutral: () => ({
    ...PHASES.iterations(),
    nextAction: next("none", "neutral", "Rien n'attend d'action.", ""),
  }),
  noSprint: () => ({ ...PHASES.iterations(), main: { kind: "sprint", tickets: [] } }),
  client: () => ({
    ...PHASES.framing(),
    audience: "client",
    canInvite: false,
    project: { ...base.project, clientContact: undefined },
    nextAction: next(
      "client_to_validate",
      "warning",
      "Le cahier fonctionnel attend votre validation",
      "2 fonctionnalités à valider.",
      {
        label: "Valider",
        href: `/projects/${P}/spec/functional`,
        kind: "link",
      },
    ),
    stats: [
      {
        key: "validations",
        icon: "person",
        label: "Vos validations attendues",
        value: "1",
        note: "fonctionnel",
      },
    ],
  }),
};

const TOTAL = 120;
const PAGE = 50;
/** Activité complète : 120 événements, pages de 50 (curseur = rang du premier de la page suivante). */
function activityPage(url: URL): Reply {
  const start = Number(url.searchParams.get("cursor") ?? 0);
  const count = Math.min(PAGE, TOTAL - start);
  const items = Array.from({ length: count }, (_, i) =>
    activityItem(
      "team",
      "Awa Koné",
      "AK",
      `Événement d'activité numéro ${start + i + 1}`,
      minutesAgo(start + i + 1),
    ),
  );
  const nextCursor = start + count < TOTAL ? String(start + count) : null;
  return reply(200, { items, nextCursor, previousCursor: null, offset: start, total: TOTAL });
}

function answer(url: URL, projectId: string, action: string, scenario: OverviewScenario): Reply {
  if (projectId !== P)
    return reply(404, { defined: true, code: "NOT_FOUND", message: "Not found" });
  if (action === "activity") return activityPage(url);
  const mode = scenario.overview ?? "framing";
  if (mode === "error")
    return reply(500, { defined: false, code: "INTERNAL", message: "Internal error" });
  return reply(200, PHASES[mode === "loading" ? "framing" : mode]());
}

export function handleOverview(
  req: IncomingMessage,
  url: URL,
  h: { scenario: OverviewScenario; send: Send; hold: (release: () => void) => void },
): boolean {
  const match = ROUTE.exec(url.pathname);
  if (!match || req.method !== "GET") return false;
  const [, projectId = "", action = ""] = match;
  const respond = () => h.send(answer(url, projectId, action, h.scenario));
  if (h.scenario.overview === "loading" && action === "overview") h.hold(respond);
  else respond();
  return true;
}

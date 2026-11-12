import type { IncomingMessage } from "node:http";

/**
 * Faux API des onglets Règles métier, Rôles et permissions et Parcours (TK-103, contrat 3.1.0) :
 * `spec.functional.list`, `spec.roles.matrix` et la lecture d'édition `spec.item.get` des trois types.
 * Deux jeux : « démo » (4 règles, 3 rôles à 6 actions, 2 parcours : la maquette 10) et « volume » (300 règles, 18 parcours,
 * 3 rôles à 47 actions en 12 ressources), choisi par le mode de spec `large*`. Aucun appel réel.
 */
type Reply = { status: number; body: string };
const reply = (status: number, body: unknown): Reply => ({ status, body: JSON.stringify(body) });

const SHA = "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678";
const pad = (n: number): string => String(n).padStart(3, "0");

type RuleType = "contrainte" | "calcul" | "workflow";
interface Rule {
  kind: "rule";
  specId: string;
  title: string;
  type: RuleType;
  statement: string;
  example?: string;
  states: string[];
  features: string[];
  filePath: string;
}

const DEMO_RULES: Rule[] = [
  {
    kind: "rule",
    specId: "R-001",
    title: "Un créneau, une réservation",
    type: "contrainte",
    statement: "Un créneau ne peut être réservé que par une seule personne à la fois.",
    example: "Deux clients visent 14 h : le second voit les trois créneaux les plus proches.",
    states: [],
    features: ["F-001", "F-003"],
    filePath: "domain/rules/R-001-un-creneau-une-reservation.md",
  },
  {
    kind: "rule",
    specId: "R-002",
    title: "Délai d'annulation",
    type: "contrainte",
    statement: "Une réservation ne peut être annulée ou déplacée qu'à plus de 2 h du rendez-vous.",
    example: "Rendez-vous à 14 h : annulation possible jusqu'à 12 h.",
    states: [],
    features: ["F-002"],
    filePath: "domain/rules/R-002-delai-annulation.md",
  },
  {
    kind: "rule",
    specId: "R-003",
    title: "Acompte des longues prestations",
    type: "calcul",
    statement:
      "Une prestation de plus de 2 h demande un acompte de 20 % du prix, arrondi à l'euro supérieur.",
    example: "Couleur + soin à 145 € : acompte de 29 €.",
    states: [],
    features: ["F-001", "F-005"],
    filePath: "domain/rules/R-003-acompte.md",
  },
  {
    kind: "rule",
    specId: "R-004",
    title: "Cycle d'une réservation",
    type: "workflow",
    statement:
      "Une réservation est confirmée, puis honorée, annulée ou marquée absente par l'accueil.",
    example: "Le client ne vient pas : l'accueil la marque « absente » depuis l'agenda.",
    states: ["Confirmée", "Honorée", "Annulée", "Absente"],
    features: ["F-001", "F-002", "F-006"],
    filePath: "domain/rules/R-004-cycle-reservation.md",
  },
];

const VOLUME_PATTERNS: Array<[RuleType, string, string]> = [
  ["contrainte", "Droit de modifier le", "Un {n} ne peut être modifié que par le gérant."],
  ["calcul", "Arrondi du", "Le montant d'un {n} est arrondi au centime supérieur."],
  ["contrainte", "Expiration du", "Un {n} expire au bout de 12 mois sans utilisation."],
  ["workflow", "Cycle du", "Un {n} passe de brouillon à actif, puis à archivé."],
];
const NOUNS = [
  "forfait",
  "code promo",
  "avoir",
  "acompte",
  "horaire",
  "congé",
  "rappel",
  "rapport",
];

function volumeRule(index: number): Rule {
  const k = index - 5;
  const [type, head, text] = VOLUME_PATTERNS[k % 4] as (typeof VOLUME_PATTERNS)[number];
  const noun = NOUNS[Math.floor(k / 4) % NOUNS.length] as string;
  return {
    kind: "rule",
    specId: `R-${pad(index)}`,
    title: `${head} ${noun} (${index})`,
    type,
    statement: text.replace("{n}", noun),
    example: "Exemple chiffré à compléter avec le client.",
    states: type === "workflow" ? ["Brouillon", "Actif", "Archivé"] : [],
    features: [`F-${pad(8 + ((k * 3) % 240))}`],
    filePath: `domain/rules/R-${pad(index)}-regle.md`,
  };
}

const VOLUME_RULES: Rule[] = [
  ...DEMO_RULES,
  ...Array.from({ length: 296 }, (_, i) => volumeRule(i + 5)),
];

const step = (label: string, screen?: string) => (screen ? { label, screen } : { label });
const DEMO_FLOWS = [
  {
    kind: "flow",
    specId: "P-reserver",
    title: "Réserver un rendez-vous",
    actor: "Client",
    start: step("Accueil du portail", "S-accueil"),
    steps: [
      step("Choisir un service", "S-services"),
      step("Choisir un créneau", "S-creneaux"),
      step("Saisir ses coordonnées", "S-reservation"),
      step("Confirmation", "S-confirmation"),
    ],
    errors: [
      {
        step: 4,
        text: "créneau pris entre-temps → retour à l'étape 3 avec les trois créneaux les plus proches (F-001 · AC-2, R-001).",
      },
      { step: 4, text: "téléphone invalide → message sous le champ, rien n'est perdu." },
    ],
    features: ["F-001", "F-004"],
    filePath: "design/flows/P-reserver.yaml",
  },
  {
    kind: "flow",
    specId: "P-annuler",
    title: "Annuler ou déplacer",
    actor: "Client, depuis le SMS",
    start: step("Lien du SMS"),
    steps: [step("Annuler ou déplacer", "S-annulation"), step("Confirmation", "S-confirmation")],
    errors: [{ step: 2, text: "moins de 2 h avant → refus avec le téléphone du salon (R-002)." }],
    features: ["F-002"],
    filePath: "design/flows/P-annuler.yaml",
  },
];
const FLOW_TITLES = [
  "Payer un acompte",
  "Laisser un avis",
  "Rejoindre la liste d'attente",
  "Acheter une carte cadeau",
  "Modifier ses coordonnées",
  "Bloquer un créneau",
  "Ouvrir la journée",
  "Clôturer la caisse",
  "Inviter un employé",
  "Créer un service",
  "Exporter la comptabilité",
  "Gérer une absence",
  "Envoyer une campagne SMS",
  "Consulter son historique",
  "Changer ses horaires",
  "Répondre à un avis",
];
const VOLUME_FLOWS = [
  ...DEMO_FLOWS,
  ...FLOW_TITLES.map((title, k) => ({
    ...(DEMO_FLOWS[k % 2] as (typeof DEMO_FLOWS)[number]),
    specId: `P-volume-${pad(k + 3)}`,
    title,
    filePath: `design/flows/P-volume-${pad(k + 3)}.yaml`,
  })),
];

const ROLES = [
  {
    specId: "RL-client",
    name: "Client",
    description: "Réserve sans compte, identifié par son téléphone.",
  },
  {
    specId: "RL-accueil",
    name: "Accueil",
    description: "Gère l'agenda du jour et les réservations au téléphone.",
  },
  {
    specId: "RL-gerant",
    name: "Gérant",
    description: "Gère les services, les prix et le personnel.",
  },
];
type Level = "allowed" | "restricted" | "denied";
interface Action {
  specId: string;
  label: string;
  resource: string;
  levels: Level[];
  restriction?: string;
}
const DEMO_ACTIONS: Action[] = [
  {
    specId: "PM-reservation.creer",
    label: "Réserver un créneau",
    resource: "Réservation",
    levels: ["allowed", "allowed", "allowed"],
  },
  {
    specId: "PM-reservation.modifier",
    label: "Annuler ou déplacer",
    resource: "Réservation",
    levels: ["restricted", "allowed", "allowed"],
    restriction: "Les siennes",
  },
  {
    specId: "PM-agenda.lire",
    label: "Voir l'agenda du jour",
    resource: "Agenda et créneaux",
    levels: ["denied", "allowed", "allowed"],
  },
  {
    specId: "PM-creneau.bloquer",
    label: "Bloquer un créneau",
    resource: "Agenda et créneaux",
    levels: ["denied", "allowed", "allowed"],
  },
  {
    specId: "PM-service.gerer",
    label: "Gérer les services et les prix",
    resource: "Catalogue",
    levels: ["denied", "denied", "allowed"],
  },
  {
    specId: "PM-employe.gerer",
    label: "Gérer le personnel",
    resource: "Personnel",
    levels: ["denied", "denied", "allowed"],
  },
];
const EXTRA = [
  ["Paiement et caisse", "paiement", 12],
  ["Communication", "message", 8],
  ["Rapports", "rapport", 7],
  ["Administration", "reglage", 14],
] as const;
const VERBS = ["Créer", "Modifier", "Supprimer", "Consulter", "Exporter", "Valider", "Archiver"];
const VERB_IDS = ["creer", "modifier", "supprimer", "lire", "exporter", "valider", "archiver"];
const VOLUME_ACTIONS: Action[] = [
  ...DEMO_ACTIONS,
  ...EXTRA.flatMap(([resource, id, count]) =>
    Array.from({ length: count }, (_, j) => ({
      specId: `PM-${id}.${VERB_IDS[j % 7]}${j >= 7 ? "_lot" : ""}`,
      label: `${VERBS[j % 7]} · ${resource.toLowerCase()}${j >= 7 ? " (en lot)" : ""}`,
      resource,
      levels: (j % 3 === 0
        ? ["denied", "allowed", "allowed"]
        : ["denied", "denied", "allowed"]) as Level[],
    })),
  ),
];

const accessOf = (action: Action) =>
  ROLES.map((role, index) => ({
    roleId: role.specId,
    level: action.levels[index] as Level,
    ...(action.levels[index] === "restricted" && action.restriction
      ? { restriction: action.restriction }
      : {}),
  }));
const view = (action: Action) => ({
  specId: action.specId,
  label: action.label,
  resource: action.resource,
  access: accessOf(action),
});

/** Les groupes de moins de 5 actions sont ouverts d'office, les autres sur demande (`group`) ; sous 21 actions, tout est ouvert. */
function matrix(url: URL, volume: boolean): Reply {
  const all = volume ? VOLUME_ACTIONS : DEMO_ACTIONS;
  const q = (url.searchParams.get("q") ?? "").toLowerCase();
  const asked = url.searchParams.get("group");
  const found = all.filter((a) => !q || `${a.label} ${a.specId}`.toLowerCase().includes(q));
  const resources = [...new Set(found.map((a) => a.resource))];
  const groups = resources.map((resource) => {
    const count = found.filter((a) => a.resource === resource).length;
    return { resource, count, open: found.length <= 20 || count < 5 || resource === asked };
  });
  const shown = found.filter((a) => groups.find((g) => g.resource === a.resource)?.open);
  return reply(200, {
    roles: ROLES.map((role) => ({
      ...role,
      permissionCount: all.filter((a) => a.levels[ROLES.indexOf(role)] !== "denied").length,
    })),
    groups,
    actions: shown.map(view),
    total: found.length,
  });
}

function functional(url: URL, volume: boolean): Reply {
  const tab = url.searchParams.get("tab");
  const rules = volume ? VOLUME_RULES : DEMO_RULES;
  const flows = volume ? VOLUME_FLOWS : DEMO_FLOWS;
  const type = url.searchParams.get("type");
  const q = (url.searchParams.get("q") ?? "").toLowerCase();
  const pool = (tab === "flows" ? flows : rules).filter(
    (item) =>
      (!type || tab === "flows" || (item as Rule).type === type) &&
      (!q || `${item.title} ${item.specId}`.toLowerCase().includes(q)),
  );
  const limit = Number(url.searchParams.get("limit") ?? 24);
  const around = url.searchParams.get("around");
  const cursor = url.searchParams.get("cursor");
  let from = cursor ? Number(cursor) : 0;
  if (around) {
    const at = pool.findIndex((item) => item.specId === around);
    if (at === -1) return reply(404, { defined: true, code: "NOT_FOUND", message: "NOT_FOUND" });
    from = Math.floor(at / limit) * limit;
  }
  return reply(200, {
    items: pool.slice(from, from + limit),
    nextCursor: from + limit < pool.length ? String(from + limit) : null,
    previousCursor: from > 0 ? String(Math.max(0, from - limit)) : null,
    offset: from,
    total: pool.length,
  });
}

function item(type: string, id: string, volume: boolean): Reply {
  const base = { commitSha: SHA };
  if (type === "rule") {
    const found = (volume ? VOLUME_RULES : DEMO_RULES).find((r) => r.specId === id);
    if (!found) return reply(404, { defined: true, code: "NOT_FOUND", message: "NOT_FOUND" });
    return reply(200, {
      type,
      id,
      values: {
        specId: id,
        title: found.title,
        type: found.type,
        statement: found.statement,
        examples: found.example ? [found.example] : [],
        states: found.states,
        features: found.features,
        tables: [],
        endpoints: [],
        filePath: found.filePath,
        ...base,
      },
      validated: false,
      referencedBy: { items: [], total: 0 },
    });
  }
  if (type === "role") {
    const found = ROLES.find((r) => r.specId === id);
    if (!found) return reply(404, { defined: true, code: "NOT_FOUND", message: "NOT_FOUND" });
    const index = ROLES.indexOf(found);
    return reply(200, {
      type,
      id,
      values: {
        specId: id,
        name: found.name,
        description: found.description,
        permissions: DEMO_ACTIONS.filter((a) => a.levels[index] !== "denied").map((a) => ({
          specId: a.specId,
          ...(a.levels[index] === "restricted" && a.restriction
            ? { restriction: a.restriction }
            : {}),
        })),
        filePath: "domain/roles.yaml",
        ...base,
      },
      validated: false,
      referencedBy: { items: [], total: 0 },
    });
  }
  const found = (volume ? VOLUME_FLOWS : DEMO_FLOWS).find((f) => f.specId === id);
  if (!found) return reply(404, { defined: true, code: "NOT_FOUND", message: "NOT_FOUND" });
  const { kind: _kind, ...values } = found;
  return reply(200, {
    type,
    id,
    values: { ...values, ...base },
    validated: false,
    referencedBy: { items: [], total: 0 },
  });
}

interface Handlers {
  send: (reply: Reply) => void;
}

/** Nombres de `spec.head.counts` du jeu de données choisi. */
export const domainCounts = (volume: boolean) =>
  volume ? { rules: 300, roles: 3, flows: 18 } : { rules: 4, roles: 3, flows: 2 };

/** Répond aux lectures des trois onglets, `false` pour toute autre route. */
export function handleSpecDomain(
  req: IncomingMessage,
  url: URL,
  h: Handlers,
  volume: boolean,
): boolean {
  if (req.method !== "GET") return false;
  if (/^\/projects\/[^/]+\/spec\/functional$/.test(url.pathname)) {
    h.send(functional(url, volume));
    return true;
  }
  if (/^\/projects\/[^/]+\/spec\/roles\/matrix$/.test(url.pathname)) {
    h.send(matrix(url, volume));
    return true;
  }
  const match = /^\/projects\/[^/]+\/spec\/items\/(rule|role|flow)\/([^/]+)$/.exec(url.pathname);
  if (match) {
    h.send(item(match[1] as string, match[2] as string, volume));
    return true;
  }
  return false;
}

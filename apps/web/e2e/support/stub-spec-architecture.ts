import type { IncomingMessage } from "node:http";

/**
 * Faux API de l'écran Architecture (TK-111, contrat 3.9.0) : `spec.architecture.components.list`, `.document`, `.checks`
 * et la lecture d'édition `spec.item.get` du type `component`. Trois jeux, choisis par le scénario (`architecture`) :
 * « empty » (aucun composant : état Prêt), « demo » (8 composants, 6 sections : la maquette 13) et « volume » (120
 * composants sur 6 zones, comme `seed:large`). Aucun appel réel, aucune donnée réelle.
 */
export type ArchitectureMode = "empty" | "demo" | "volume";
export type ArchitectureScenario = { architecture?: ArchitectureMode };

type Reply = { status: number; body: string };
const reply = (status: number, body: unknown): Reply => ({ status, body: JSON.stringify(body) });
const typed = (status: number, code: string): Reply =>
  reply(status, { defined: true, code, message: code });

const SHA = "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678";
const ZONES = [
  "Prise de rendez-vous",
  "Clients et fidélité",
  "Catalogue et stock",
  "Paiement et caisse",
  "Personnel",
  "Communication",
];

type Type = "app" | "service" | "store" | "queue" | "ext";
interface Component {
  specId: string;
  name: string;
  type: Type;
  zone: string;
  responsibility: string;
  owns: string[];
  serves: string[];
  dependsOn: Array<{ to: string; via: string; async?: boolean }>;
  decisions: string[];
}

const DEMO: Component[] = [
  {
    specId: "C-web",
    name: "Application web",
    type: "app",
    zone: ZONES[0] as string,
    responsibility: "Réservation en ligne pour les clients et agenda du jour pour l'accueil.",
    owns: [],
    serves: ["F-001", "F-002"],
    dependsOn: [{ to: "C-api", via: "HTTPS" }],
    decisions: ["ADR-002"],
  },
  {
    specId: "C-api",
    name: "API",
    type: "service",
    zone: ZONES[0] as string,
    responsibility:
      "Cœur du produit : règles métier, réservations, créneaux, services. Seul composant à écrire en base.",
    owns: ["T-reservation", "T-creneau", "T-service", "T-client"],
    serves: ["F-001", "F-002", "F-004", "F-006"],
    dependsOn: [
      { to: "C-db", via: "SQL" },
      { to: "C-auth", via: "jetons" },
      { to: "C-queue", via: "planifie", async: true },
    ],
    decisions: ["ADR-001", "ADR-003"],
  },
  {
    specId: "C-db",
    name: "Base de données",
    type: "store",
    zone: ZONES[0] as string,
    responsibility: "Stockage relationnel de toutes les données du produit.",
    owns: [],
    serves: [],
    dependsOn: [],
    decisions: ["ADR-001"],
  },
  {
    specId: "C-auth",
    name: "Authentification",
    type: "service",
    zone: ZONES[4] as string,
    responsibility: "Connexion du personnel par lien magique, jetons de session.",
    owns: [],
    serves: ["F-006"],
    dependsOn: [{ to: "C-db", via: "SQL" }],
    decisions: ["ADR-004"],
  },
  {
    specId: "C-queue",
    name: "File de tâches",
    type: "queue",
    zone: ZONES[5] as string,
    responsibility: "Planifie les tâches datées : rappels de la veille, purge des données.",
    owns: [],
    serves: ["F-003"],
    dependsOn: [],
    decisions: [],
  },
  {
    specId: "C-worker",
    name: "Worker",
    type: "service",
    zone: ZONES[5] as string,
    responsibility: "Exécute les tâches de la file : envoi des SMS, génération des PDF.",
    owns: ["T-rappel"],
    serves: ["F-003"],
    dependsOn: [
      { to: "C-queue", via: "consomme", async: true },
      { to: "C-sms", via: "HTTPS" },
    ],
    decisions: ["ADR-005"],
  },
  {
    specId: "C-sms",
    name: "Fournisseur SMS",
    type: "ext",
    zone: ZONES[5] as string,
    responsibility: "Envoi des SMS de rappel, service d'un prestataire externe.",
    owns: [],
    serves: [],
    dependsOn: [],
    decisions: ["ADR-005"],
  },
  {
    specId: "C-pay",
    name: "Passerelle de paiement",
    type: "ext",
    zone: ZONES[3] as string,
    responsibility: "Encaissement des acomptes, service d'un prestataire externe.",
    owns: [],
    serves: ["F-007"],
    dependsOn: [],
    decisions: ["ADR-006"],
  },
];

const VOLUME_COUNT = 120;
const TYPES: Type[] = ["service", "app", "store", "queue", "ext"];
const pad = (n: number): string => String(n).padStart(3, "0");
const GENERATED: Component[] = Array.from({ length: VOLUME_COUNT - DEMO.length }, (_, i) => {
  const n = DEMO.length + i + 1;
  return {
    specId: `C-composant-${pad(n)}`,
    name: `Composant ${pad(n)}`,
    type: TYPES[n % TYPES.length] as Type,
    zone: ZONES[n % ZONES.length] as string,
    responsibility: `Responsabilité du composant ${n}.`,
    owns: [],
    serves: [],
    dependsOn: [{ to: "C-api", via: "HTTPS" }],
    decisions: n % 4 === 0 ? ["ADR-001"] : [],
  };
});

const componentsOf = (mode: ArchitectureMode): Component[] =>
  mode === "empty" ? [] : mode === "volume" ? [...DEMO, ...GENERATED] : DEMO;

/** Compteur de `spec.head.counts.components` d'après le mode du scénario. */
export const architectureCounts = (mode: ArchitectureMode | undefined) =>
  mode ? { components: componentsOf(mode).length } : {};

const summaryOf = (component: Component) => ({
  specId: component.specId,
  name: component.name,
  type: component.type,
  zone: component.zone,
  responsibility: component.responsibility.split("\n")[0],
  dependsOnCount: component.dependsOn.length,
  decisions: component.decisions,
  filePath: `architecture/components/${component.specId.slice(2)}.yaml`,
});

const PAGE = 50;

function listComponents(url: URL, mode: ArchitectureMode): Reply {
  const all = componentsOf(mode);
  const q = url.searchParams.get("q")?.toLowerCase();
  const zone = url.searchParams.get("zone");
  const around = url.searchParams.get("around");
  const cursor = url.searchParams.get("cursor");
  const limit = Number(url.searchParams.get("limit") ?? PAGE) || PAGE;
  const filtered = all.filter(
    (c) =>
      (!zone || c.zone === zone) &&
      (!q || c.name.toLowerCase().includes(q) || c.specId.toLowerCase().includes(q)),
  );
  let start = 0;
  if (cursor) start = Number(cursor.split(":")[1]);
  else if (around) {
    const index = filtered.findIndex((c) => c.specId === around);
    if (index === -1) return typed(404, "NOT_FOUND");
    start = Math.floor(index / limit) * limit;
  }
  const end = Math.min(filtered.length, start + limit);
  const zones: Record<string, number> = {};
  for (const c of all.filter((x) => !q || x.name.toLowerCase().includes(q))) {
    zones[c.zone] = (zones[c.zone] ?? 0) + 1;
  }
  return reply(200, {
    items: filtered.slice(start, end).map(summaryOf),
    nextCursor: end < filtered.length ? `a:${end}` : null,
    previousCursor: start > 0 ? `b:${start}` : null,
    offset: start,
    total: filtered.length,
    facets: { zone: zones },
  });
}

type Status = "validee" | "a_relire" | "brouillon" | "a_rediger";
const section = (num: number, slug: string, title: string, status: Status, markdown: string) => ({
  specId: `DOC-${slug}`,
  slug,
  num,
  path: `architecture/overview/${pad(num).slice(1)}-${slug}.md`,
  title,
  status,
  markdown,
  updatedAt: null,
  lastAuthor: null,
});

const SECTIONS = [
  section(
    1,
    "contexte",
    "Contexte",
    "validee",
    "Le portail de réservation remplace le carnet papier et le téléphone. Il sert trois publics : les clients, qui réservent sans compte ; l'accueil, qui gère l'agenda du jour ; le gérant, qui gère services, prix et personnel.",
  ),
  section(
    2,
    "vue-ensemble",
    "Vue d'ensemble",
    "validee",
    "Une application unique découpée en six zones. Deux applications web appellent une API ; un worker exécute les tâches datées ; une seule base relationnelle.\nLe schéma détaillé est généré depuis architecture/components/*.yaml.",
  ),
  section(
    3,
    "principes",
    "Principes",
    "a_relire",
    "Ces règles guident tous les choix :\n- un module ne lit jamais les tables d'un autre (ADR-001) ;\n- seule l'API écrit en base ;\n- toute règle métier est appliquée côté serveur (R-001 à R-004).",
  ),
  section(
    4,
    "deploiement",
    "Déploiement",
    "brouillon",
    "Un environnement de recette et un de production. Déploiement continu depuis la branche principale vers la recette ; la production se déploie sur validation.",
  ),
  section(
    5,
    "securite",
    "Sécurité et données personnelles",
    "validee",
    "Données personnelles isolées et chiffrées au repos, purgées après 3 ans (NFR-001). Personnel connecté par lien magique (ADR-004). Journal d'audit des actions.",
  ),
  section(6, "sauvegarde", "Sauvegarde et reprise", "a_rediger", ""),
];

const documentOf = (mode: ArchitectureMode) =>
  reply(200, { sections: mode === "empty" ? [SECTIONS[0]] : SECTIONS, commitSha: SHA });

const checksOf = (mode: ArchitectureMode) =>
  reply(200, {
    warnings:
      mode === "empty"
        ? []
        : [
            {
              code: "ARCH_FLOW_MISSING",
              entityId: "P-liste-attente",
              message: "Le parcours P-liste-attente n'a pas encore de flux.",
            },
            {
              code: "ARCH_TABLE_UNOWNED",
              entityId: "T-avis",
              message: "La table T-avis n'a aucun composant propriétaire.",
            },
          ],
  });

const ROUTE = /^\/projects\/[^/]+\/spec\/architecture\/(components|document|checks)$/;
const ITEM = /^\/projects\/[^/]+\/spec\/items\/component\/([^/]+)$/;

interface Handlers {
  send: (reply: Reply) => void;
}

/** Répond aux lectures de l'écran Architecture et à la lecture d'édition d'un composant, `false` pour toute autre route. */
export function handleSpecArchitecture(
  req: IncomingMessage,
  url: URL,
  h: Handlers,
  mode: ArchitectureMode | undefined,
): boolean {
  if (req.method !== "GET" || !mode) return false;
  const item = ITEM.exec(url.pathname);
  if (item) {
    const found = componentsOf(mode).find((c) => c.specId === item[1]);
    h.send(
      found
        ? reply(200, {
            type: "component",
            id: found.specId,
            values: {
              ...found,
              filePath: `architecture/components/${found.specId.slice(2)}.yaml`,
              commitSha: SHA,
            },
            validated: false,
            referencedBy: { items: [], total: 0 },
          })
        : typed(404, "NOT_FOUND"),
    );
    return true;
  }
  const match = ROUTE.exec(url.pathname);
  if (!match) return false;
  if (match[1] === "components") h.send(listComponents(url, mode));
  else if (match[1] === "document") h.send(documentOf(mode));
  else h.send(checksOf(mode));
  return true;
}

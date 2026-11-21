import type { IncomingMessage } from "node:http";

/**
 * Faux API de l'écran Architecture (TK-111, contrat 3.9.0) : `spec.architecture.components.list`, `.document`, `.checks`
 * et la lecture d'édition `spec.item.get` du type `component`. Trois jeux, choisis par le scénario (`architecture`) :
 * « empty » (aucun composant : état Prêt), « demo » (8 composants, 6 sections : la maquette 13) et « volume » (120
 * composants sur 6 zones, comme `seed:large`). Aucun appel réel, aucune donnée réelle.
 */
export type ArchitectureMode = "empty" | "demo" | "volume";
export type ArchitectureScenario = { architecture?: ArchitectureMode };

export type Reply = { status: number; body: string };
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
export interface Component {
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

export const componentsOf = (mode: ArchitectureMode): Component[] =>
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

// --- TK-112 (contrat 3.10.0) : zones, zone, recherche, positions, flux, YAML et Mermaid ---
const slugOf = (text: string): string =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
const ICONS: Record<string, string> = {
  "Prise de rendez-vous": "event",
  "Paiement et caisse": "payments",
  Communication: "notifications",
  "Catalogue et stock": "inventory_2",
  Personnel: "badge",
};
const zoneIdOf = (name: string): string => slugOf(name);

/** Liens d'une zone vers les autres : une paire de composants reliés par `dependsOn` compte une fois, dans les deux sens. */
function zoneLinks(all: readonly Component[], name: string) {
  const zoneOf = new Map(all.map((c) => [c.specId, c.zone]));
  const links = new Map<string, number>();
  const add = (zone: string) => links.set(zoneIdOf(zone), (links.get(zoneIdOf(zone)) ?? 0) + 1);
  for (const c of all) {
    for (const dep of c.dependsOn) {
      const [a, b] = [zoneOf.get(c.specId), zoneOf.get(dep.to)];
      if (a === undefined || b === undefined || a === b) continue;
      if (a === name) add(b);
      if (b === name) add(a);
    }
  }
  return [...links].map(([to, count]) => ({ to, count }));
}

function zonesOf(mode: ArchitectureMode) {
  const all = componentsOf(mode);
  const names = [...new Set(all.map((c) => c.zone))].sort((a, b) => a.localeCompare(b, "fr"));
  return names.map((name) => {
    const own = all.filter((c) => c.zone === name);
    return {
      id: zoneIdOf(name),
      name,
      icon: ICONS[name] ?? "folder_open",
      componentCount: own.length,
      actorCount: own.some((c) => c.specId === "C-web") ? 1 : 0,
      preview: own.slice(0, 7).map((c) => c.name),
      links: zoneLinks(all, name),
    };
  });
}

function zoneDetail(mode: ArchitectureMode, id: string): Reply {
  const entry = zonesOf(mode).find((zone) => zone.id === id);
  if (!entry) return typed(404, "NOT_FOUND");
  const all = componentsOf(mode);
  const own = all.filter((c) => c.zone === entry.name).slice(0, 200);
  const here = new Set(own.map((c) => c.specId));
  const outgoing = new Map<string, number>();
  for (const c of own) {
    for (const dep of c.dependsOn) {
      const target = all.find((x) => x.specId === dep.to);
      if (target && target.zone !== entry.name) {
        outgoing.set(zoneIdOf(target.zone), (outgoing.get(zoneIdOf(target.zone)) ?? 0) + 1);
      }
    }
  }
  return reply(200, {
    zone: {
      id: entry.id,
      name: entry.name,
      icon: entry.icon,
      componentCount: entry.componentCount,
    },
    components: own.map((c) => ({
      specId: c.specId,
      name: c.name,
      type: c.type,
      responsibility: c.responsibility,
    })),
    relations: own.flatMap((c) =>
      c.dependsOn
        .filter((dep) => here.has(dep.to))
        .map((dep) => ({
          from: c.specId,
          to: dep.to,
          via: dep.via,
          ...(dep.async ? { async: true } : {}),
        })),
    ),
    actors: entry.actorCount > 0 ? [{ id: "RL-client", name: "Client" }] : [],
    outgoing: [...outgoing].map(([zone, count]) => ({ zone, count })),
    truncated: false,
    commitSha: SHA,
  });
}

const FLOW_TITLES = [
  "Réserver un rendez-vous",
  "Annuler ou déplacer",
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
const FLOW_COUNT = 18;
const flowIdOf = (n: number): string =>
  n < FLOW_COUNT ? `P-${slugOf(FLOW_TITLES[n] as string)}` : `P-flux-${pad(n + 1)}`;
const flowTitleOf = (n: number): string => FLOW_TITLES[n] ?? `Flux ${pad(n + 1)}`;
const flowCountOf = (mode: ArchitectureMode): number =>
  mode === "empty" ? 0 : mode === "volume" ? 300 : FLOW_COUNT;

export function listFlows(url: URL, mode: ArchitectureMode): Reply {
  const total = flowCountOf(mode);
  const limit = Number(url.searchParams.get("limit") ?? PAGE) || PAGE;
  const around = url.searchParams.get("around");
  const cursor = url.searchParams.get("cursor");
  let start = cursor ? Number(cursor.split(":")[1]) : 0;
  if (!cursor && around) {
    const index = Array.from({ length: total }, (_, n) => n).findIndex(
      (n) => flowIdOf(n) === around,
    );
    if (index === -1) return typed(404, "NOT_FOUND");
    start = Math.floor(index / limit) * limit;
  }
  const end = Math.min(total, start + limit);
  return reply(200, {
    items: Array.from({ length: end - start }, (_, i) => ({
      specId: flowIdOf(start + i),
      title: flowTitleOf(start + i),
      actor: "Client",
      componentCount: 3,
      externalCount: 1,
    })),
    nextCursor: end < total ? `a:${end}` : null,
    previousCursor: start > 0 ? `b:${start}` : null,
    offset: start,
    total,
  });
}

export function flowDetail(mode: ArchitectureMode, id: string): Reply {
  const n = Array.from({ length: flowCountOf(mode) }, (_, i) => i).find((i) => flowIdOf(i) === id);
  if (n === undefined) return typed(404, "NOT_FOUND");
  return reply(200, {
    specId: id,
    title: flowTitleOf(n),
    actor: "Client",
    participants: [
      { id: "RL-client", name: "Client", type: "actor" },
      { id: "C-web", name: "Application web", type: "app" },
      { id: "C-api", name: "API", type: "service" },
      { id: "C-db", name: "Base de données", type: "store" },
      { id: "C-queue", name: "File de tâches", type: "queue" },
      { id: "C-sms", name: "Fournisseur SMS", type: "ext" },
    ],
    items: [
      { kind: "message", from: "RL-client", to: "C-web", text: "Choisit un service et un créneau" },
      {
        kind: "message",
        from: "C-web",
        to: "C-api",
        text: "reservation.create",
        reply: "Confirmée + lien d'annulation",
      },
      {
        kind: "message",
        from: "C-api",
        to: "C-db",
        text: "Insère la réservation (créneau unique, R-001)",
        reply: "ok",
      },
      {
        kind: "message",
        from: "C-api",
        to: "C-queue",
        text: "Planifie le rappel : veille 18 h (R-003)",
      },
      {
        kind: "alt",
        label: "sinon · créneau pris entre-temps (F-001 · AC-2)",
        messages: [
          {
            from: "C-db",
            to: "C-api",
            text: "Conflit d'unicité",
            error: "409 · les 3 créneaux les plus proches",
          },
        ],
      },
      { kind: "separator", label: "La veille à 18 h" },
      { kind: "message", from: "C-queue", to: "C-sms", text: "Envoie le SMS de rappel" },
    ],
    features: ["F-001", "F-003"],
    rules: ["R-001", "R-003"],
    decisions: ["ADR-003", "ADR-007"],
    filePath: `architecture/flows/${id.slice(2)}.yaml`,
    commitSha: SHA,
  });
}

const componentYaml = (c: Component): string => {
  const lines = [
    `id: ${c.specId}`,
    `nom: ${c.name}`,
    `type: ${c.type}`,
    `zone: ${c.zone}`,
    "responsabilite: >",
    `  ${c.responsibility}`,
  ];
  if (c.dependsOn.length > 0) {
    lines.push("depend_de:", ...c.dependsOn.map((d) => `  - vers: ${d.to}\n    via: "${d.via}"`));
  }
  return `${lines.join("\n")}\n`;
};

function sourceOf(url: URL, mode: ArchitectureMode): Reply {
  const kind = url.searchParams.get("target[kind]");
  const id = url.searchParams.get("target[id]") ?? "";
  const format = url.searchParams.get("format") ?? "yaml";
  if (kind === "schema") {
    const text = [
      "flowchart TB",
      ...componentsOf(mode)
        .slice(0, 12)
        .map((c) => `  ${c.specId.replace("-", "_")}["${c.name}"]`),
    ].join("\n");
    return reply(200, {
      path: "architecture/schema.mmd",
      text: `${text}\n`,
      commitSha: SHA,
      generated: true,
    });
  }
  if (kind === "flow") {
    return format === "mermaid"
      ? reply(200, {
          path: `architecture/flows/${id.slice(2)}.mmd`,
          text: "sequenceDiagram\n  participant Client\n  Client->>API: reservation.create\n",
          commitSha: SHA,
          generated: true,
        })
      : reply(200, {
          path: `architecture/flows/${id.slice(2)}.yaml`,
          text: `id: ${id}\nparcours: ${id}\nparticipants: [RL-client, C-web, C-api]\n`,
          commitSha: SHA,
          generated: false,
        });
  }
  const found = componentsOf(mode).find((c) => c.specId === id);
  return found
    ? reply(200, {
        path: `architecture/components/${id.slice(2)}.yaml`,
        text: componentYaml(found),
        commitSha: SHA,
        generated: false,
      })
    : typed(404, "NOT_FOUND");
}

const LAYOUT_SHA = "b2c3d4e5f60718293a4b5c6d7e8f9012345678a1";
let layoutPositions: Record<string, { x: number; y: number }> = {};
const layoutSaves: Array<Record<string, unknown>> = [];

/** Remet à zéro les positions et le journal des dépôts d'architecture (changement de scénario). */
export function resetArchitectureLayout(): void {
  layoutPositions = {};
  layoutSaves.length = 0;
}

const ROUTE =
  /^\/projects\/[^/]+\/spec\/architecture\/(components|document|checks|zones|zone|search|layout|flows|source)$/;
const FLOW = /^\/projects\/[^/]+\/spec\/architecture\/flows\/([^/]+)$/;
const ITEM = /^\/projects\/[^/]+\/spec\/items\/component\/([^/]+)$/;

interface Handlers {
  send: (reply: Reply) => void;
}

/** Dépôt des positions (`architecture.layout.save`) : journal pour `/__layout-saves`, dernier écrit gagne. */
function saveLayout(req: IncomingMessage, h: Handlers): void {
  let raw = "";
  req.on("data", (chunk) => {
    raw += chunk;
  });
  req.on("end", () => {
    const body = JSON.parse(raw || "{}") as {
      positions?: Record<string, { x: number; y: number }>;
    };
    layoutSaves.push(body);
    layoutPositions = body.positions ?? {};
    h.send(reply(200, { commitSha: LAYOUT_SHA }));
  });
}

/** Lecture d'édition d'un composant (`spec.item.get`, type `component`). */
function componentItem(mode: ArchitectureMode, id: string): Reply {
  const found = componentsOf(mode).find((c) => c.specId === id);
  if (!found) return typed(404, "NOT_FOUND");
  return reply(200, {
    type: "component",
    id: found.specId,
    values: {
      ...found,
      filePath: `architecture/components/${found.specId.slice(2)}.yaml`,
      commitSha: SHA,
    },
    validated: false,
    referencedBy: { items: [], total: 0 },
  });
}

function searchComponents(url: URL, mode: ArchitectureMode): Reply {
  const q = (url.searchParams.get("q") ?? "").toLowerCase();
  const items = componentsOf(mode)
    .filter((c) => c.name.toLowerCase().includes(q) || c.specId.toLowerCase().includes(q))
    .slice(0, 20)
    .map((c) => ({ specId: c.specId, name: c.name, type: c.type, zone: c.zone }));
  return reply(200, { items });
}

/** Lectures par route : un faux serveur par procédure de `spec.architecture.*`. */
const readersOf = (url: URL, mode: ArchitectureMode): Record<string, () => Reply> => ({
  components: () => listComponents(url, mode),
  document: () => documentOf(mode),
  checks: () => checksOf(mode),
  zones: () =>
    reply(200, { zones: zonesOf(mode), componentCount: componentsOf(mode).length, commitSha: SHA }),
  zone: () => zoneDetail(mode, url.searchParams.get("zone") ?? ""),
  search: () => searchComponents(url, mode),
  layout: () => reply(200, { positions: layoutPositions, commitSha: LAYOUT_SHA }),
  flows: () => listFlows(url, mode),
  source: () => sourceOf(url, mode),
});

/** Répond aux lectures de l'écran Architecture, au dépôt des positions et aux lectures d'édition, `false` pour toute autre route. */
export function handleSpecArchitecture(
  req: IncomingMessage,
  url: URL,
  h: Handlers,
  mode: ArchitectureMode | undefined,
): boolean {
  if (!mode) return false;
  if (url.pathname === "/__layout-saves") {
    h.send(reply(200, layoutSaves));
    return true;
  }
  if (req.method === "POST" && url.pathname.endsWith("/spec/architecture/layout")) {
    saveLayout(req, h);
    return true;
  }
  if (req.method !== "GET") return false;
  const flow = FLOW.exec(url.pathname);
  const item = ITEM.exec(url.pathname);
  const route = ROUTE.exec(url.pathname)?.[1];
  const answer = flow
    ? flowDetail(mode, flow[1] as string)
    : item
      ? componentItem(mode, item[1] as string)
      : route
        ? readersOf(url, mode)[route]?.()
        : undefined;
  if (!answer) return false;
  h.send(answer);
  return true;
}

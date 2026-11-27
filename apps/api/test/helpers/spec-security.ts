import type { INestApplication } from "@nestjs/common";
import type { Actor } from "./organizations.ts";
import type { RepoBench } from "./repo-scene.ts";
import { type EntitySeed, entity, readScene, seedIndex } from "./spec-read.ts";
import { send } from "./tickets.ts";

/**
 * Clients HTTP et entités d'index du livrable Sécurité (TK-117, contrat 3.19.0) : mêmes formes que celles que le worker
 * écrit depuis `security/` (une entité par menace et par entrée de données ; `transferts` repris sur chaque entrée).
 */
export function securityApi(app: INestApplication, actor: Pick<Actor, "cookie"> | undefined) {
  const cookie = actor?.cookie;
  const at = (p: string, path: string) => `/projects/${p}/spec/security${path}`;
  const get = (p: string, path: string) => send(app, cookie, "get", at(p, path));
  const post = (p: string, path: string, body: Record<string, unknown>) =>
    send(app, cookie, "post", at(p, path), { projectId: p, ...body });
  const write = (p: string, path: string, body: Record<string, unknown>) =>
    post(p, path, { idempotencyKey: `secu-${Math.random().toString(36).slice(2)}`, ...body });
  return {
    threats: (p: string, query = "") => get(p, `/threats${query}`),
    threat: (p: string, id: string) => get(p, `/threats/${id}`),
    createThreat: (p: string, over: Record<string, unknown> = {}) =>
      write(p, "/threats", { ...NEW_THREAT, ...over }),
    updateThreat: (p: string, id: string, over: Record<string, unknown>) =>
      write(p, `/threats/${id}`, { threatId: id, ...over }),
    data: (p: string, query = "") => get(p, `/data${query}`),
    classify: (p: string, body: Record<string, unknown>) => write(p, "/data", body),
    registry: (p: string) => get(p, "/data/registry"),
    rights: (p: string) => get(p, "/rights"),
    asvs: (p: string) => get(p, "/asvs"),
    setLevel: (p: string, level: number) => write(p, "/asvs/level", { level }),
    summary: (p: string) => get(p, "/summary"),
    propose: (p: string) => post(p, "/summary/proposals", {}),
    accept: (p: string, proposalId: string) => write(p, "/summary/accept", { proposalId }),
    validate: (p: string, version: string) => post(p, "/validate", { version }),
  };
}

export function clientSecurityApi(app: INestApplication, actor: Pick<Actor, "cookie"> | undefined) {
  const cookie = actor?.cookie;
  const at = (p: string) => `/client-space/projects/${p}/security`;
  return {
    get: (p: string) => send(app, cookie, "get", at(p)),
    setContact: (p: string, name: string, phone: string) =>
      send(app, cookie, "post", `${at(p)}/contact`, { projectId: p, name, phone }),
  };
}

export const NEW_THREAT = {
  title: "Créneaux bloqués en masse",
  surfaces: ["F-001"],
  category: "abuse",
  severity: "medium",
  risk: "Un script bloque tous les créneaux.",
  measures: ["Code reçu par SMS."],
  verification: "scenario",
};

const security = (kind: string, specId: string, data: Record<string, unknown>): EntitySeed =>
  entity(kind as EntitySeed["kind"], specId, JSON.stringify(data), data);

export const threatEntity = (id: string, over: Record<string, unknown> = {}) =>
  security("threat", id, {
    id,
    titre: `Menace ${id}`,
    surfaces: ["F-001"],
    categorie: "abus",
    gravite: "moyenne",
    risque: "Un abus est possible.",
    parades: ["Limiter les essais."],
    verification: { mode: "scenario" },
    liens: [],
    ...over,
  });

export const entryEntity = (field: string, over: Record<string, unknown> = {}) => {
  const data = {
    donnee: `Donnée ${field}`,
    champs: [field],
    categorie: "technique",
    acces: [],
    ...over,
  } as Record<string, unknown>;
  return security("sensitive", field, { ...data, titre: data.donnee });
};

export const tableEntity = (slug: string, fields: readonly string[]) =>
  security("table", `T-${slug}`, {
    id: `T-${slug}`,
    titre: slug,
    champs: fields.map((nom) => ({ nom, type: "texte" })),
  });

export const securityRoles = (over: Record<string, unknown> = {}) =>
  security("roles", "roles", {
    titre: "Rôles et permissions",
    permissions: [
      { id: "PM-client.lire", ressource: "client", action: "lire", libelle: "Lire les clientes" },
      { id: "PM-client.exporter", ressource: "client", action: "exporter" },
    ],
    roles: [
      {
        id: "RL-accueil",
        nom: "Accueil",
        description: "Accueil",
        permissions: ["PM-client.lire"],
        restrictions: { "PM-client.lire": "du jour" },
      },
      {
        id: "RL-gerante",
        nom: "Gérante",
        description: "Gérante",
        permissions: ["PM-client.lire", "PM-client.exporter"],
      },
    ],
    ...over,
  });

export const rightsEntity = (over: Record<string, unknown> = {}) =>
  security("rights", "rights", {
    titre: "Matrice des droits",
    matrice: [],
    restrictions: [],
    propriete: ["Chacun ne voit que son salon."],
    ...over,
  });

export const asvsEntity = (over: Record<string, unknown> = {}) =>
  security("asvs", "asvs", {
    titre: "Exigences ASVS",
    exigences: [],
    secrets_et_dependances: [],
    ...over,
  });

export const SUMMARY = {
  donnees: "Chez l'hébergeur, à Paris.",
  protection: "Les téléphones sont chiffrés.",
  acces: "Chacun ne voit que ses rendez-vous.",
  connexion: "Un lien à usage unique.",
  conservation: "À décider",
  verification: "Des tests à chaque modification.",
  incident: "Nous vous prévenons sous 24 heures.",
};
export const summaryEntity = (over: Record<string, unknown> = {}) =>
  security("security_summary", "summary", { titre: "Résumé client", ...SUMMARY, ...over });

export const operationOf = (id: string, permission: string, sert: readonly string[] = ["F-001"]) =>
  security("endpoint", id, {
    id,
    type: "lecture",
    zone: "Clientes",
    composant: "C-api",
    permission,
    resume: `Opération ${id}.`,
    titre: `Opération ${id}.`,
    entree: {},
    sortie: {},
    erreurs: [],
    regles: [],
    sert,
  });

/** Tête sans blocage : une menace traitée, tous les champs classés et les données personnelles datées. */
export const clearedSeeds = (over: { entries?: EntitySeed[]; threats?: EntitySeed[] } = {}) => [
  securityRoles(),
  tableEntity("clientes", ["telephone", "identifiant"]),
  operationOf("client.list", "PM-client.lire"),
  ...(over.threats ?? [threatEntity("SEC-T01", { gravite: "elevee" })]),
  ...(over.entries ?? [
    entryEntity("clientes.telephone", { categorie: "contact", conservation: "3 ans" }),
    entryEntity("clientes.identifiant"),
  ]),
];

export const FEATURES = [
  { id: "F-001", titre: "Réserver en ligne" },
  { id: "F-002", titre: "Fichier clientes" },
];

/** Projet (monde neuf) avec dépôt de spec et la tête indexée `entities`. */
export async function securityScene(
  bench: Pick<RepoBench, "database" | "app" | "harness">,
  entities: EntitySeed[],
  over: Parameters<typeof readScene>[1] = {},
) {
  const repo = bench as RepoBench;
  const scene = await readScene(repo, over);
  const head = await seedIndex(repo, scene, FEATURES, { commit: true, entities });
  return { ...scene, sha: head.sha, snapshotId: head.snapshotId };
}

import type { INestApplication } from "@nestjs/common";
import type { Actor } from "./organizations.ts";
import { type EntitySeed, entity } from "./spec-read.ts";
import { send } from "./tickets.ts";

/**
 * Clients HTTP et entités d'index du cahier technique (TK-115, contrat 3.17.0) : mêmes formes que celles que le worker
 * écrit depuis `tech/stack/`, `api/endpoints/`, `nfr/` et `tech/environments.yaml`.
 */
export function technicalApi(app: INestApplication, actor: Pick<Actor, "cookie"> | undefined) {
  const cookie = actor?.cookie;
  const at = (p: string, path: string) => `/projects/${p}/spec/${path}`;
  const get = (p: string, path: string) => send(app, cookie, "get", at(p, path));
  return {
    stack: (p: string, query = "") => get(p, `technical/stack${query}`),
    source: (p: string, id: string) => get(p, `technical/stack/${id}/source`),
    environments: (p: string) => get(p, "technical/environments"),
    sections: (p: string, deliverable = "technical") =>
      get(p, `document/sections?deliverable=${deliverable}`),
    choose: (p: string, id: string, option: string, over: Record<string, unknown> = {}) =>
      send(app, cookie, "post", at(p, `technical/stack/${id}/choose`), {
        projectId: p,
        id,
        option,
        idempotencyKey: `choose-${id}-${option}`.replace(/[^A-Za-z0-9._:-]/g, "-"),
        ...over,
      }),
  };
}

export function clientTechnicalApi(
  app: INestApplication,
  actor: Pick<Actor, "cookie"> | undefined,
) {
  const get = (p: string, path: string) =>
    send(app, actor?.cookie, "get", `/client-space/projects/${p}/technical${path}`);
  return {
    summary: (p: string) => get(p, ""),
    stack: (p: string, query = "") => get(p, `/stack${query}`),
    environments: (p: string) => get(p, "/environments"),
    document: (p: string) => get(p, "/document"),
  };
}

/** Genre d'entité du cahier technique, que le type des graines d'index ne nomme pas encore. */
const technical = (kind: string, specId: string, data: Record<string, unknown>): EntitySeed =>
  entity(kind as EntitySeed["kind"], specId, JSON.stringify(data), data);

export const stackData = (id: string, over: Record<string, unknown> = {}) => {
  const data = {
    id,
    couche: "externes",
    icone: "sms",
    role: "Fournisseur SMS",
    statut: "a_trancher",
    recommande: "Brevo",
    composants: ["C-sms"],
    options: ["Brevo", "Twilio"],
    criteres: [{ nom: "Prix par SMS", estimation: true, valeurs: ["≈ 0,045 €", "≈ 0,07 €"] }],
    pourquoi: "Envoi des rappels.",
    en_clair: "Le prestataire des rappels reste à choisir.",
    exigences: ["NFR-001"],
    decisions: ["ADR-001"],
    ...over,
  } as Record<string, unknown>;
  const choice = typeof data.choix === "string" ? data.choix : "à trancher";
  return { ...data, titre: `${data.role} : ${choice}` };
};
export const stackEntity = (id: string, over: Record<string, unknown> = {}) =>
  technical("stack", id, stackData(id, over));

export const operationEntity = (id: string, over: Record<string, unknown> = {}) =>
  technical("endpoint", id, {
    id,
    type: "ecriture",
    zone: "Réservation",
    composant: "C-api",
    permission: "public",
    resume: `Opération ${id}.`,
    titre: `Opération ${id}.`,
    entree: {},
    sortie: {},
    erreurs: [],
    regles: [],
    sert: [],
    ...over,
  });

export const nfrEntity = (id: string, over: Record<string, unknown> = {}) =>
  technical("nfr", id, {
    id,
    categorie: "performance",
    titre: `Exigence ${id}`,
    cible: "p95 < 300 ms",
    enonce: "Les appels répondent vite.",
    verification: { mode: "mesure_ci" },
    liens: [],
    ...over,
  });

export const ENVIRONMENTS = {
  titre: "Environnements",
  environnements: [
    {
      id: "ENV-developpement",
      nom: "Développement",
      adresse: "localhost:3000",
      hebergement: "Poste du développeur",
      base: "PostgreSQL local",
      donnees: "jeux_exemple",
    },
    {
      id: "ENV-recette",
      nom: "Recette",
      adresse: "recette.exemple.fr",
      hebergement: "Hébergeur, Paris",
      base: "PostgreSQL géré",
      donnees: "copie_anonymisee",
      deploiement: "fusion",
      acces: "Équipe et client",
      lignes: [{ libelle: "SMS", valeur: "Numéros de test" }],
    },
  ],
  variables: [{ nom: "DATABASE_URL", usage: "Connexion à la base" }],
  integrations: [{ service: "SMS", usage: "Rappels", statut: "a_trancher" }],
};
export const environmentsEntity = (over: Record<string, unknown> = {}) =>
  technical("environments", "environments", { ...ENVIRONMENTS, ...over });

export const componentEntity = (id: string, over: Record<string, unknown> = {}) =>
  entity("component", id, JSON.stringify(over), {
    id,
    nom: id.slice(2),
    titre: id.slice(2),
    type: "service",
    zone: "Noyau",
    responsabilite: "Fait son travail.",
    ...over,
  });

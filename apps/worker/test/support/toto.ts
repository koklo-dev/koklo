import type { CurrentArchflow, CurrentComponent } from "@koklo/db";
import type { LaunchSources } from "../../src/agent-propose/sources.ts";

/**
 * Sources du projet Toto (TK-114d, B649) : 23 composants dont 2 applications (« Écran Liste de courses », « Page de
 * transparence ») qui ne listent aucun rôle, 8 zones, 22 flux techniques où un rôle appelle directement un service, 5 rôles.
 * Données inventées, aucune donnée réelle.
 */
export const TOTO_ROLES = [
  { specId: "RL-colocataire", title: "Colocataire" },
  { specId: "RL-admin-colocation", title: "Administrateur de la colocation" },
  { specId: "RL-visiteur", title: "Visiteur" },
  { specId: "RL-gestionnaire", title: "Gestionnaire" },
  { specId: "RL-invite", title: "Invité" },
];

export const TOTO_ZONES = [
  "Courses",
  "Colocation",
  "Dépenses",
  "Transparence",
  "Tâches",
  "Comptes",
  "Notifications",
  "Données",
];

export const TOTO_APPS = ["C-ecran-liste-de-courses", "C-page-de-transparence"];
export const TOTO_DATABASE = "C-base-de-donnees";

const pad = (n: number) => String(n).padStart(2, "0");

/** 19 services, deux par zone métier (la zone Données garde la base, Notifications aussi le service d'envoi externe). */
export const TOTO_SERVICES = Array.from({ length: 19 }, (_, i) => `C-service-${pad(i + 1)}`);

const component = (
  specId: string,
  title: string,
  type: string,
  zone: string,
  dependsOn: CurrentComponent["dependsOn"] = [],
): CurrentComponent => ({ specId, title, zone, type, owns: [], serves: [], dependsOn, actors: [] });

export const TOTO_COMPONENTS: CurrentComponent[] = [
  component(TOTO_APPS[0] as string, "Écran Liste de courses", "app", "Courses"),
  component(TOTO_APPS[1] as string, "Page de transparence", "app", "Transparence"),
  ...TOTO_SERVICES.map((id, i) =>
    component(id, `Service ${i + 1}`, "service", TOTO_ZONES[i % 7] as string, [
      { to: TOTO_DATABASE, via: "SQL" },
    ]),
  ),
  component(TOTO_DATABASE, "Base de données", "store", "Données"),
  component("C-service-envoi", "Service d'envoi", "ext", "Notifications"),
];

/** Flux n (1..22) : le rôle n % 5 appelle directement le service n % 19, une branche `alt` en retour. */
export const TOTO_FLOWS = Array.from({ length: 22 }, (_, i) => ({
  specId: `P-parcours-${pad(i + 1)}`,
  title: `Parcours ${i + 1}`,
}));

export const TOTO_ARCHFLOWS: CurrentArchflow[] = TOTO_FLOWS.map(({ specId }, i) => {
  const role = TOTO_ROLES[i % 5]?.specId as string;
  const service = TOTO_SERVICES[i % 19] as string;
  return {
    specId,
    title: specId,
    participants: [role, service, TOTO_DATABASE],
    messages: [
      { from: role, to: service, text: "Demande", reply: "Répond" },
      { from: service, to: TOTO_DATABASE, text: "Enregistre" },
      {
        block: "alt",
        label: "Sinon · refus",
        messages: [{ from: service, to: role, text: "Refuse", error: "Conflit (409)" }],
      },
    ],
    features: [],
    rules: [],
    decisions: [],
  };
});

export const TOTO_SOURCES: LaunchSources = {
  tag: "architecture",
  pages: [],
  synthesis: null,
  risks: null,
  features: [],
  rules: [],
  roles: TOTO_ROLES,
  flows: TOTO_FLOWS,
  tables: [],
  tableIds: [],
  architecture: {
    components: TOTO_COMPONENTS,
    archflows: TOTO_ARCHFLOWS,
    decisions: [],
    nfr: [],
  },
};

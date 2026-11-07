/** Données fictives de la section « Onglets et tableaux · C » de la galerie `/dev/ui`. */
import type { TabsNavItem } from "@koklo/ui";

export const NAV_TABS: TabsNavItem[] = [
  { label: "Vue d'ensemble", href: "#dev-ui-surf-c", active: true, icon: "space_dashboard" },
  { label: "Fonctionnalités", href: "#dev-ui-surf-c", count: 12 },
  { label: "Décisions", href: "#dev-ui-surf-c", count: 3 },
  { label: "Historique", href: "#dev-ui-surf-c" },
];

export const STATE_TABS = [
  { value: "open", label: "Ouvertes", count: 4 },
  { value: "done", label: "Terminées", count: 9 },
  { value: "all", label: "Toutes" },
] as const;

export const MEMBERS = [
  {
    name: "Camille Durand",
    email: "camille@exemple.fr",
    role: "Propriétaire",
    projects: 6,
    last: "Aujourd'hui",
  },
  { name: "Samir Benali", email: "samir@exemple.fr", role: "Éditeur", projects: 3, last: "Hier" },
  {
    name: "Léa Martin",
    email: "lea@exemple.fr",
    role: "Lecteur",
    projects: 1,
    last: "Il y a 5 jours",
  },
] as const;

export const MATRIX_ROLES = ["Propriétaire", "Éditeur", "Lecteur"] as const;

export const MATRIX = [
  { action: "Consulter la spec", allowed: [true, true, true] },
  { action: "Proposer une modification", allowed: [true, true, false] },
  { action: "Gérer les membres", allowed: [true, false, false] },
] as const;

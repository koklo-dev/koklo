import type { IdeaPageSummary } from "@koklo/contract";
import { PAGE_STATUS_LABEL } from "@koklo/ui";
import { ageOf } from "./spec-age.ts";

export const pageNumber = (index: number): string => String(index).padStart(2, "0");

/** « 05 · Périmètre » : le numéro est la place dans le dossier, pas un identifiant. */
export const numberedTitle = (title: string, index: number): string =>
  `${pageNumber(index)} · ${title}`;

/** Fichier publié dans le dépôt (décision 9 : le slug sans numéro). */
export const ideaFile = (slug: string): string => `idea/${slug}.md`;

export const statusLabel = (status: IdeaPageSummary["status"]): string => PAGE_STATUS_LABEL[status];

/** « Modifié par Marie Lefèvre (client) il y a 5 minutes » ; sans auteur connu : « Jamais modifiée ». */
export function modifiedLine(page: IdeaPageSummary, now = Date.now()): string {
  if (!page.updatedBy) return "Jamais modifiée";
  const who = page.updatedBy.isClient ? `${page.updatedBy.name} (client)` : page.updatedBy.name;
  return `Modifié par ${who} ${ageOf(page.updatedAt, now)}`;
}

/** Texte de la copie locale ou de l'enregistrement vu de l'en-tête. */
export type SaveState = "idle" | "saving" | "saved" | "offline" | "conflict" | "error";

export const SAVE_LABEL: Record<SaveState, string> = {
  idle: "Brouillon enregistré",
  saved: "Brouillon enregistré",
  saving: "Enregistrement…",
  offline: "Hors ligne : modifications gardées localement",
  conflict: "Conflit de version : votre saisie est gardée",
  error: "Enregistrement impossible : modifications gardées localement",
};

export const moveAnnouncement = (title: string, position: number, total: number): string =>
  `${title} déplacée en position ${position} sur ${total}`;

/** Adresse de la page Synthèse dans l'espace Idée : `?page=synthese`. */
export const SYNTHESIS_PAGE = "synthese";

/** Fichier publié de la Synthèse (généré, jamais saisi). */
export const SYNTHESIS_FILE = "idea/_synthese.md";

/** Raison dite à côté de « Passer au cadrage » désactivé : « …il manque : Utilisateurs et Périmètre stables ». */
export function framingReason(missing: readonly string[]): string {
  const last = missing.at(-1) ?? "";
  const list =
    missing.length <= 1
      ? `${last} stable`
      : `${missing.slice(0, -1).join(", ")} et ${last} stables`;
  return `Pour passer au cadrage, il manque : ${list}`;
}

/** « 8 novembre 2026 », à l'heure de Paris. */
export const synthesisDate = (iso: string): string =>
  new Date(iso).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Paris",
  });

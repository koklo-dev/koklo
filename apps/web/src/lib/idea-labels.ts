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

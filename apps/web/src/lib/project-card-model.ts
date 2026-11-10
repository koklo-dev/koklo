import type { ProjectCard } from "@koklo/contract";
import type { ProjectCardProps } from "@koklo/ui";
import { whenOf } from "./overview-labels.ts";
import { projectPath } from "./shell-routes.ts";

export type CardAudience = "team" | "client";

export const NO_CLIENT = "Aucun client invité";

const MIN = 60_000;

/** Âge court de la ligne d'activité (maquette 08 l.190-194) : « il y a 20 min », « il y a 2 h », « hier », « il y a 3 j ». */
export function shortAgeOf(iso: string, now = Date.now()): string {
  const minutes = Math.floor(Math.max(0, now - new Date(iso).getTime()) / MIN);
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "hier" : `il y a ${days} j`;
}

const plural = (count: number, one: string, other: string) => (count === 1 ? one : other);

/** « 5 projets · 3 attendent une action » (maquette 08 l.230) ; sans projet « Aucun projet ». */
export function countLabel(total: number, attention: number): string {
  if (total === 0) return "Aucun projet";
  const projects = `${total} ${plural(total, "projet", "projets")}`;
  return attention > 0
    ? `${projects} · ${attention} ${plural(attention, "attend", "attendent")} une action`
    : projects;
}

function activityOf(card: ProjectCard, now: number): string | null {
  if (!card.lastActivity) return null;
  const when = whenOf(card.lastActivity.at, now, shortAgeOf);
  return card.lastActivity.actor ? `${card.lastActivity.actor}, ${when}` : when;
}

/** Propriétés de `ProjectCard` pour une carte du serveur ; la vue client n'a pas de ligne de client. */
export function cardPropsOf(
  card: ProjectCard,
  audience: CardAudience,
  now = Date.now(),
): Omit<ProjectCardProps, "LinkComponent" | "className"> {
  return {
    href: projectPath(card.id),
    name: card.name,
    initials: card.initials,
    colorKey: card.colorKey as ProjectCardProps["colorKey"],
    client: audience === "client" ? null : (card.clientContact ?? NO_CLIENT),
    phase: card.phase as ProjectCardProps["phase"],
    progress: card.progress,
    next: card.nextAction,
    people: card.people.map((person) => ({
      initials: person.initials,
      name: person.client ? `${person.name} (client)` : person.name,
      isClient: person.client,
    })),
    activity: activityOf(card, now),
  };
}

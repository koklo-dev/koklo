import type { ReactNode } from "react";
import { cn } from "../lib/cn.ts";
import { Avatar, AvatarFallback, type AvatarTone } from "./avatar.tsx";

export type ActivityActorKind = "client" | "team" | "agent";

const TONE: Record<ActivityActorKind, AvatarTone> = {
  client: "warning",
  agent: "agent",
  team: "soft",
};

export interface ActivityFeedItem {
  actor: { kind: ActivityActorKind; initials: string };
  /** Phrase complète, construite par le serveur. */
  text: ReactNode;
  /** Date relative déjà mise en forme (« il y a 5 min »). */
  when: ReactNode;
}

/** Initiales d'un acteur : avatar décoratif de 32, le nom est dans la phrase. */
export function ActorAvatar({ kind, initials }: ActivityFeedItem["actor"]) {
  return (
    <Avatar size={32} tone={TONE[kind]} aria-hidden="true">
      <AvatarFallback className="text-[11px] font-semibold">{initials}</AvatarFallback>
    </Avatar>
  );
}

/** Fil d'activité (DESIGN.md §5.11, maquette 07 l.172-179) : liste d'écart 14, avatar, phrase 13, date relative 12. */
export function ActivityFeed({
  items,
  className,
  label,
}: {
  items: readonly ActivityFeedItem[];
  className?: string;
  /** Nom de la liste quand aucun titre ne la précède. */
  label?: string;
}) {
  return (
    <ul
      data-slot="activity-feed"
      aria-label={label}
      className={cn("m-0 flex list-none flex-col gap-3.5 p-0", className)}
    >
      {items.map((item, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: journal en lecture seule, l'ordre est celui du serveur
        <li key={index} className="flex items-start gap-3">
          <ActorAvatar {...item.actor} />
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="text-meta">{item.text}</span>
            <span className="text-caption font-normal text-muted-foreground">{item.when}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

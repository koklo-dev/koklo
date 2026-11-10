import { cn } from "../lib/cn.ts";
import { Avatar, AvatarFallback } from "./avatar.tsx";

export interface AvatarGroupPerson {
  /** Nom complet : nom accessible et infobulle (ex. « Marie Lefèvre (client) »). */
  name: string;
  initials: string;
  /** Un client prend le ton `warning`. */
  isClient?: boolean;
}

/** Pile d'avatars (DESIGN.md §5.8) : 28 px, bordure de 2 `--background`, chevauchement de -8 (-6 en 24), au plus `max` visibles. */
export function AvatarGroup({
  people,
  max = 5,
  size = 28,
  label,
  className,
}: {
  people: AvatarGroupPerson[];
  max?: number;
  /** 28 par défaut ; 24 sur les cartes de projet. */
  size?: 24 | 28;
  label?: string;
  className?: string;
}) {
  const shown = people.slice(0, max);
  const hidden = people.length - shown.length;
  return (
    <ul
      data-slot="avatar-group"
      aria-label={label}
      className={cn("m-0 flex list-none items-center p-0", className)}
    >
      {shown.map((person, index) => (
        <li
          key={`${person.initials}-${person.name}`}
          title={person.name}
          className={cn("flex", index > 0 && (size === 24 ? "-ml-1.5" : "-ml-2"))}
        >
          <Avatar
            size={size}
            tone={person.isClient ? "warning" : "soft"}
            className="border-2 border-background"
          >
            <AvatarFallback aria-label={person.name} role="img">
              {person.initials}
            </AvatarFallback>
          </Avatar>
        </li>
      ))}
      {hidden > 0 ? (
        <li className={cn("flex", size === 24 ? "-ml-1.5" : "-ml-2")}>
          <Avatar size={size} tone="muted" className="border-2 border-background">
            <AvatarFallback
              aria-label={`${hidden} autres`}
              role="img"
            >{`+${hidden}`}</AvatarFallback>
          </Avatar>
        </li>
      ) : null}
    </ul>
  );
}

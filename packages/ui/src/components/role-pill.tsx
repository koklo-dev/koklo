import type { ComponentProps } from "react";
import type { IconName } from "../icons/icon.tsx";
import { Pill, type PillTone } from "./pill.tsx";

export type Role = "owner" | "admin" | "developer" | "designer" | "business" | "client";

const ROLE: Record<Role, { label: string; tone: PillTone }> = {
  owner: { label: "Propriétaire", tone: "soft" },
  admin: { label: "Administrateur", tone: "soft" },
  developer: { label: "Développeur", tone: "outline" },
  designer: { label: "Designer", tone: "outline" },
  business: { label: "Business", tone: "outline" },
  client: { label: "Client", tone: "warning" },
};

export type RolePillProps = Omit<ComponentProps<"span">, "children"> & {
  role: Role;
  /** Icône pleine avant le libellé (en-tête de Réglages : `badge`, `person` pour le client). */
  icon?: IconName;
  /** Teinte imposée (en-tête de Réglages, planche 24 : pleine sauf client en ambre) ; sinon celle du rôle. */
  tone?: PillTone;
};

/** Rôle d'un membre (DESIGN.md §5.5) : `Pill` md, libellé français fixé par le rôle. */
export function RolePill({ role, icon, tone: toneOverride, ...props }: RolePillProps) {
  const { label, tone } = ROLE[role];
  return (
    <Pill tone={toneOverride ?? tone} icon={icon} data-role={role} {...props}>
      {label}
    </Pill>
  );
}

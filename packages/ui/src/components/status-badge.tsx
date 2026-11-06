"use client";

import type { HTMLAttributes } from "react";
import { ValidationStatus } from "./validation-status.tsx";

export type Status = "validated" | "pending" | "revise";

export interface StatusBadgeProps extends Omit<HTMLAttributes<HTMLSpanElement>, "children"> {
  status: Status;
  /** Libellé texte obligatoire : un statut ne se lit jamais par la couleur seule. */
  label: string;
  size?: "default" | "lg";
}

/**
 * @deprecated Utiliser `ValidationStatus`. Alias conservé pour les écrans non refondus
 * (`ai-credential-status.tsx`, `project-create-steps.tsx`) : il délègue sans rien ajouter.
 */
export function StatusBadge(props: StatusBadgeProps) {
  return <ValidationStatus {...props} />;
}

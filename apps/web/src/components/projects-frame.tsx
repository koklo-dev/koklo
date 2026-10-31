"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { AppFrame } from "./app-frame.tsx";

/**
 * Gabarit de `/projects`. Les pages d'un projet (`/projects/<id>/features`) sont imbriquées sous ce layout et
 * portent leur propre gabarit : on ne les encadre pas une seconde fois (une seule barre latérale, un seul fil d'Ariane).
 */
export function ProjectsFrame({ children }: { children: ReactNode }) {
  const nested = usePathname().startsWith("/projects/");
  return nested ? children : <AppFrame current="Projets">{children}</AppFrame>;
}

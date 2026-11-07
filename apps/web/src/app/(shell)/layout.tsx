import type { ReactNode } from "react";
import { ShellFrame } from "../../components/shell-frame.tsx";

/** Coquille commune des pages connectées de l'organisation active : projets, pages d'un projet, réglages. */
export default function ShellLayout({ children }: { children: ReactNode }): ReactNode {
  return <ShellFrame>{children}</ShellFrame>;
}

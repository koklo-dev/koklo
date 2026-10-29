import type { ReactNode } from "react";
import { AppFrame } from "../../components/app-frame.tsx";

export default function ProjectsLayout({ children }: { children: ReactNode }) {
  return <AppFrame current="Projets">{children}</AppFrame>;
}

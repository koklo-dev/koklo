import type { ReactNode } from "react";
import { ProjectsFrame } from "../../components/projects-frame.tsx";

export default function ProjectsLayout({ children }: { children: ReactNode }) {
  return <ProjectsFrame>{children}</ProjectsFrame>;
}

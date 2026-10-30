import type { ReactNode } from "react";
import { AppFrame } from "../../components/app-frame.tsx";

export default function KanbanLayout({ children }: { children: ReactNode }) {
  return <AppFrame current="Kanban">{children}</AppFrame>;
}

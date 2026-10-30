import type { Metadata } from "next";
import { KanbanPage } from "../../components/kanban-page.tsx";

export const metadata: Metadata = { title: "Kanban · Koklo" };

export default function Page() {
  return (
    <>
      <h1 className="mb-2 text-[30px] font-semibold tracking-[-0.025em]">Kanban</h1>
      <KanbanPage />
    </>
  );
}

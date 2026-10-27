import type { Metadata } from "next";
import { AppShell } from "../../components/app-shell.tsx";
import { ProjectsPage } from "../../components/projects-page.tsx";

export const metadata: Metadata = { title: "Projets · Koklo" };

export default function Page() {
  return (
    <AppShell>
      <h1 className="mb-6 text-[30px] font-semibold tracking-[-0.025em]">Projets</h1>
      <ProjectsPage />
    </AppShell>
  );
}

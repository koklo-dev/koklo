import type { Metadata } from "next";
import { PageBody } from "../../../components/page-body.tsx";
import { ProjectsPage } from "../../../components/projects-page.tsx";

export const metadata: Metadata = { title: "Projets · Koklo" };

export default function Page() {
  return (
    <PageBody>
      <h1 className="mb-6 text-page-title">Projets</h1>
      <ProjectsPage />
    </PageBody>
  );
}

import type { Metadata } from "next";
import { OrganizationsPage } from "../../components/organizations-page.tsx";

export const metadata: Metadata = { title: "Organisations · Koklo" };

export default function Page() {
  return <OrganizationsPage />;
}

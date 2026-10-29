import type { Metadata } from "next";
import { MembersPage } from "../../components/members-page.tsx";

export const metadata: Metadata = { title: "Membres · Koklo" };

export default function Page() {
  return <MembersPage />;
}

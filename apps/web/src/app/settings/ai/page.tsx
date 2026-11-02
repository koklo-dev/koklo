import type { Metadata } from "next";
import { AiSettingsPage } from "../../../components/ai-settings-page.tsx";

export const metadata: Metadata = { title: "IA · Koklo" };

export default function Page() {
  return <AiSettingsPage />;
}

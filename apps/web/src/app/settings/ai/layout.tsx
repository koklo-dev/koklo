import type { ReactNode } from "react";
import { AppFrame } from "../../../components/app-frame.tsx";

export default function AiSettingsLayout({ children }: { children: ReactNode }) {
  return <AppFrame current={["Réglages", "IA"]}>{children}</AppFrame>;
}

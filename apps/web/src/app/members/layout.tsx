import type { ReactNode } from "react";
import { AppFrame } from "../../components/app-frame.tsx";

export default function MembersLayout({ children }: { children: ReactNode }) {
  return <AppFrame current="Membres">{children}</AppFrame>;
}

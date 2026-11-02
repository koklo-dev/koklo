import type { ReactNode } from "react";
import { AppFrame } from "../../../../components/app-frame.tsx";

/** Gabarit sans fil d'Ariane propre : « Koklo > Projets > nom > Cadrage » est porté par la page. */
export default function FramingLayout({ children }: { children: ReactNode }): ReactNode {
  return <AppFrame>{children}</AppFrame>;
}

import type { ReactNode } from "react";
import { AppFrame } from "../../../../components/app-frame.tsx";

/** Gabarit sans fil d'Ariane propre : « Koklo > Projets > nom > Fonctionnalités » est porté par la page. */
export default function FeaturesLayout({ children }: { children: ReactNode }): ReactNode {
  return <AppFrame>{children}</AppFrame>;
}

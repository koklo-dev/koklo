import type { ReactNode } from "react";

/** Corps d'une page sous son en-tête : marges de la page (16 px, 32 px dès 768 px), jamais plus large que l'écran. */
export function PageBody({ children }: { children: ReactNode }) {
  return <div className="min-w-0 px-4 py-6 md:px-8">{children}</div>;
}

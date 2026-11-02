import { resolve } from "node:path";
import type { NextConfig } from "next";

const config: NextConfig = {
  // Image promouvable : `.next/standalone` ne contient aucune URL d'environnement, tout est lu à l'exécution.
  output: "standalone",
  outputFileTracingRoot: resolve(import.meta.dirname, "../.."),
  poweredByHeader: false,
  // Dev uniquement : les e2e ouvrent http://127.0.0.1 ; sans cela le HMR (donc l'hydratation) est bloqué.
  allowedDevOrigins: ["127.0.0.1"],
  // Dev uniquement : la pastille Next recouvre la bascule de thème (bas de la barre latérale) et intercepte les clics.
  devIndicators: false,
  // Réglages de l'IA (S-ai-settings §5) : la saisie d'une clé ne doit ni être mise en cache ni fuiter par le Referer.
  // Limités à cette route : aucune règle générale.
  headers: async () => [
    {
      source: "/settings/ai",
      headers: [
        { key: "Cache-Control", value: "no-store" },
        { key: "Referrer-Policy", value: "no-referrer" },
      ],
    },
  ],
};

export default config;

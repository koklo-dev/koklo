import { resolve } from "node:path";
import type { NextConfig } from "next";

const config: NextConfig = {
  // Image promouvable : `.next/standalone` ne contient aucune URL d'environnement, tout est lu à l'exécution.
  output: "standalone",
  outputFileTracingRoot: resolve(import.meta.dirname, "../.."),
  poweredByHeader: false,
  // Dev uniquement : les e2e ouvrent http://127.0.0.1 ; sans cela le HMR (donc l'hydratation) est bloqué.
  allowedDevOrigins: ["127.0.0.1"],
};

export default config;

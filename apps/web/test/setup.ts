import "@testing-library/jest-dom/vitest";
import { cleanup, configure } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => cleanup());

// Délai d'attente par défaut de waitFor / findBy* (1 s dans Testing Library) : sur un runner saturé, un
// premier rendu peut le dépasser sans qu'aucune assertion soit en cause. Une attente réussie n'est pas
// ralentie ; seul un vrai échec met plus longtemps à être signalé, et le délai des tests (20 s) reste la borne.
configure({ asyncUtilTimeout: 8_000 });

// jsdom n'implémente pas matchMedia (requis par le hook use-mobile de la sidebar) : bureau par défaut.
// Les tests remplacent window.matchMedia (cf. viewport.ts) pour simuler une autre largeur.
if (typeof window !== "undefined" && typeof window.matchMedia !== "function") {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

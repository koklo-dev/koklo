import { render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { polyfillRadix } from "./support/web-mocks.ts";

/**
 * TK-87 CA6 (cas 6.1, 6.3) et CA2 (cas 2.11, partie jsdom) : galerie `/dev/ui` (fiche S-dev-ui).
 * Ouverte seulement pour `APP_ENV` ∈ {development, test, staging} (liste blanche, valeur lue à l'exécution) ; fermée par `notFound()` partout ailleurs,
 * sans session, avec chaque composant du lot 0. axe, captures et 375 px : `e2e/dev-ui.spec.ts`.
 */
const { notFound } = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));
vi.mock("next/navigation", () => ({
  notFound,
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/dev/ui",
  useSearchParams: () => new URLSearchParams(),
}));

const ENV = { API_INTERNAL_URL: "http://127.0.0.1:3101", APP_VERSION: "0.0.0-test" };

async function renderPage(appEnv: string): Promise<void> {
  vi.stubEnv("API_INTERNAL_URL", ENV.API_INTERNAL_URL);
  vi.stubEnv("APP_VERSION", ENV.APP_VERSION);
  vi.stubEnv("APP_ENV", appEnv);
  const { default: Page } = await import("../src/app/dev/ui/page.tsx");
  const element = (await (Page as () => ReactElement | Promise<ReactElement>)()) as ReactElement;
  render(element);
}

beforeEach(() => {
  polyfillRadix();
  notFound.mockClear();
  localStorage.clear();
  document.documentElement.classList.remove("dark");
});
afterEach(() => vi.unstubAllEnvs());

describe.each(["production", "prod", "Production", "preprod"])(
  "/dev/ui avec APP_ENV=%s",
  (appEnv) => {
    it("répond 404 (notFound) et ne rend aucun composant", async () => {
      await expect(renderPage(appEnv)).rejects.toThrow("NEXT_NOT_FOUND");
      expect(notFound).toHaveBeenCalledTimes(1);
      expect(document.querySelector("[data-slot]")).toBeNull();
      expect(screen.queryByText("Galerie des composants")).toBeNull();
    });
  },
);

describe.each(["test", "development", "staging"])("/dev/ui avec APP_ENV=%s", (appEnv) => {
  it("est ouverte : h1 unique « Galerie des composants », sans appel à notFound", async () => {
    await renderPage(appEnv);
    expect(notFound).not.toHaveBeenCalled();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1, name: "Galerie des composants" })).toBeVisible();
    expect(screen.getAllByRole("main")).toHaveLength(1);
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("contenu de la galerie (S-dev-ui §3)", () => {
  it("LifecycleStatus de 0 à 5", async () => {
    await renderPage("test");
    for (const [label, n] of [
      ["Idée", 1],
      ["Spécifiée", 2],
      ["Conçue", 3],
      ["Implémentée", 4],
      ["Testée", 5],
      ["Livrée", 6],
    ] as const) {
      expect(
        screen.getAllByLabelText(`Avancement : ${label}, étape ${n} sur 6`).length,
      ).toBeGreaterThan(0);
    }
  });

  it("ValidationStatus dans ses 4 tonalités et les libellés d'écran", async () => {
    await renderPage("test");
    const statuses = [...document.querySelectorAll("[data-slot='validation-status']")];
    const text = statuses.map((s) => s.textContent?.trim());
    for (const label of [
      "Validée",
      "À valider",
      "À revoir",
      "Non soumise",
      "Acceptée",
      "À relire",
      "Rejetée",
      "Active",
      "Suspendue",
      "Désinstallée",
      "Autorisée",
      "À autoriser",
    ]) {
      expect(text, label).toContain(label);
    }
  });

  it("DeliverableStatus normal, compact et compact sans libellé", async () => {
    await renderPage("test");
    const items = document.querySelectorAll("[data-slot='deliverable-status']");
    expect(items.length).toBeGreaterThanOrEqual(12);
  });

  it("PriorityIndicator : fonctionnalités et tickets", async () => {
    await renderPage("test");
    for (const label of [
      "Indispensable",
      "Importante",
      "Souhaitable",
      "Reportée",
      "Priorité critique",
      "Priorité haute",
      "Priorité moyenne",
      "Priorité basse",
    ]) {
      expect(screen.getAllByText(label).length, label).toBeGreaterThan(0);
    }
  });

  it("les 8 EntityChip, vrais liens vers une ancre", async () => {
    await renderPage("test");
    for (const name of [
      "Fonctionnalité F-001 Connexion",
      "Écran S-login",
      "Ticket TK-104",
      "Rôle RL-owner",
      "Table T-users",
      "Règle métier R-001",
      "Point d'accès E-auth-login",
      "Commit a1b2c3d",
    ]) {
      const link = screen.getByRole("link", { name });
      expect(link.getAttribute("href"), name).toMatch(/^#/);
    }
  });

  it("boutons : désactivé avec sa raison liée, transitoire aria-busy sans raison", async () => {
    await renderPage("test");
    const disabled = screen.getByRole("button", { name: "Désactivé" });
    expect(disabled).toBeDisabled();
    expect(disabled).toHaveAccessibleDescription("Toujours avec sa raison à côté");
    const busy = screen.getByRole("button", { name: "Enregistrement…" });
    expect(busy).toHaveAttribute("aria-busy", "true");
    expect(busy).not.toHaveAttribute("aria-describedby");
    expect(screen.getByRole("button", { name: "Action principale" })).toBeEnabled();
  });

  it("InlineAlert : neutre, attention, erreur ; bloc d'envoi complet et rappel", async () => {
    await renderPage("test");
    expect(screen.getAllByRole("note").length).toBeGreaterThanOrEqual(2);
    // Depuis TK-94 la galerie montre aussi des régions d'état et d'alerte de listes : on cible les InlineAlert.
    const alerts = (role: string) =>
      document.querySelector(`[data-slot='inline-alert'][role='${role}']`);
    expect(alerts("status")).toHaveTextContent("Trop de demandes.");
    expect(alerts("alert")).toHaveTextContent("Le fournisseur n'a pas répondu à temps.");
    expect(
      screen.getAllByText("Votre texte est envoyé à l'agent IA avec la clé de l'organisation.")
        .length,
    ).toBeGreaterThanOrEqual(2);
    expect(
      screen.getByText(
        "Ces propositions viennent de l'agent IA et ne sont pas encore enregistrées.",
      ),
    ).toBeInTheDocument();
  });

  it("EmptyState et PhaseRail (grands et miniatures)", async () => {
    await renderPage("test");
    expect(screen.getByText("Aucune idée encore")).toBeVisible();
    expect(screen.getAllByRole("list", { name: "Phase du projet" }).length).toBeGreaterThanOrEqual(
      3,
    );
    for (const text of [
      "Idée · 1 sur 4",
      "Cadrage · 2 sur 4",
      "Baseline 0 · 3 sur 4",
      "Itérations · 4 sur 4",
    ]) {
      expect(document.body.textContent, text).toContain(text);
    }
  });

  it("nuanciers : noms des jetons, jamais de valeur hexadécimale", async () => {
    await renderPage("test");
    for (const token of [
      "--background",
      "--surface",
      "--raised",
      "--border",
      "--border-strong",
      "--diff-bg",
      "--shadow-floating",
    ]) {
      expect(document.body.textContent, token).toContain(token);
    }
    expect(document.body.textContent).not.toMatch(/#[0-9a-fA-F]{6}\b/);
  });

  it("bascule de thème : groupe « Thème », Clair / Sombre à aria-pressed, applique .dark", async () => {
    await renderPage("test");
    const group = screen.getByRole("group", { name: "Thème" });
    const light = within(group).getByRole("button", { name: "Clair" });
    const dark = within(group).getByRole("button", { name: "Sombre" });
    expect(light).toHaveAttribute("aria-pressed", "true");
    expect(dark).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(dark);
    expect(dark).toHaveAttribute("aria-pressed", "true");
    expect(document.documentElement).toHaveClass("dark");
    await userEvent.click(light);
    expect(document.documentElement).not.toHaveClass("dark");
  });

  it("aucun appel d'API : les données sont statiques", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await renderPage("test");
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AccountPage } from "../src/components/account-page.tsx";
import { renderWithQuery } from "./support/render.tsx";
import {
  apiError,
  meSummary,
  notificationsFor,
  procedures,
  resetWebMocks,
} from "./support/web-mocks.ts";

vi.mock("next/navigation", async () => {
  const m = await import("./support/web-mocks.ts");
  return { useRouter: () => m.router, usePathname: () => m.pathname.current };
});
vi.mock("../src/lib/auth-client.ts", async () => ({
  authClient: (await import("./support/web-mocks.ts")).authClient,
}));
vi.mock("../src/lib/orpc.ts", async () => ({
  orpc: (await import("./support/web-mocks.ts")).orpc,
}));

/** TK-97 lot B : Mon compte (S-settings §3) — nom, e-mail lu seul, thème, interrupteurs d'e-mail. */
beforeEach(() => {
  resetWebMocks();
  localStorage.clear();
  document.documentElement.classList.remove("dark");
});

const name = () => screen.findByRole("textbox", { name: "Nom" });
const asRole = (role: string) => {
  procedures.meGet.mockResolvedValue(meSummary({ role }));
  procedures.meGetNotifications.mockResolvedValue(notificationsFor(role));
};
const switches = () =>
  screen
    .getAllByRole("switch")
    .map((s) => document.getElementById(s.getAttribute("aria-labelledby") ?? "")?.textContent);

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("Mon compte : identité", () => {
  it("nom modifiable, e-mail en lecture seule avec son aide", async () => {
    renderWithQuery(<AccountPage />);
    expect(await name()).toHaveValue("Awa Koné");
    const email = screen.getByRole("textbox", { name: "Adresse e-mail" });
    expect(email).toHaveValue("awa@example.com");
    expect(email).toHaveAttribute("readonly");
    expect(screen.getByText("Cette adresse sert à vous connecter")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Mon compte" })).toBeInTheDocument();
  });

  it("Enregistrer envoie seulement le nom (jamais l'e-mail) et confirme", async () => {
    procedures.meUpdate.mockResolvedValue(meSummary({ name: "Awa K." }));
    renderWithQuery(<AccountPage />);
    const field = await name();
    await userEvent.clear(field);
    await userEvent.type(field, "Awa K.");
    await userEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    await waitFor(() => expect(procedures.meUpdate.mock.calls[0]?.[0]).toEqual({ name: "Awa K." }));
    expect(await screen.findByRole("status")).toHaveTextContent("Nom enregistré");
  });

  it("nom vide ou de plus de 80 caractères : refusé avant l'appel", async () => {
    renderWithQuery(<AccountPage />);
    const field = await name();
    await userEvent.clear(field);
    await userEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    expect(await screen.findByText("Saisissez votre nom.")).toBeInTheDocument();
    await userEvent.type(field, "a".repeat(81));
    await userEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    expect(
      await screen.findByText("Le nom ne peut pas dépasser 80 caractères."),
    ).toBeInTheDocument();
    expect(procedures.meUpdate).not.toHaveBeenCalled();
  });

  it("échec serveur : alerte, saisie conservée", async () => {
    procedures.meUpdate.mockRejectedValue(apiError("INTERNAL"));
    renderWithQuery(<AccountPage />);
    await name();
    await userEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Impossible d'enregistrer");
  });

  it("chargement annoncé puis erreur avec Réessayer", async () => {
    procedures.meGet.mockRejectedValueOnce(apiError("INTERNAL"));
    renderWithQuery(<AccountPage />);
    expect(screen.getByRole("status")).toBeInTheDocument();
    await userEvent.click(await screen.findByRole("button", { name: "Réessayer" }));
    expect(await name()).toHaveValue("Awa Koné");
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("Mon compte : thème", () => {
  const group = () => screen.findByRole("radiogroup", { name: "Thème" });

  it("Clair, Sombre, Système ; Clair par défaut", async () => {
    renderWithQuery(<AccountPage />);
    const radios = within(await group()).getAllByRole("radio");
    expect(
      radios.map((r) => r.getAttribute("aria-label") ?? r.closest("label")?.textContent),
    ).toEqual(["Clair", "Sombre", "Système"]);
    expect(within(await group()).getByRole("radio", { name: "Clair" })).toBeChecked();
  });

  it("Sombre pose la classe dark et l'enregistre ; Clair l'ôte", async () => {
    renderWithQuery(<AccountPage />);
    await userEvent.click(within(await group()).getByRole("radio", { name: "Sombre" }));
    expect(document.documentElement).toHaveClass("dark");
    expect(localStorage.getItem("koklo-theme")).toBe("dark");
    await userEvent.click(within(await group()).getByRole("radio", { name: "Clair" }));
    expect(document.documentElement).not.toHaveClass("dark");
    expect(localStorage.getItem("koklo-theme")).toBe("light");
  });

  it("Système suit prefers-color-scheme et l'enregistre", async () => {
    window.matchMedia = ((query: string) => ({
      matches: query.includes("dark"),
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    })) as unknown as typeof window.matchMedia;
    renderWithQuery(<AccountPage />);
    await userEvent.click(within(await group()).getByRole("radio", { name: "Système" }));
    expect(localStorage.getItem("koklo-theme")).toBe("system");
    expect(document.documentElement).toHaveClass("dark");
    expect(within(await group()).getByRole("radio", { name: "Système" })).toBeChecked();
  });

  it("restaure le choix enregistré à l'ouverture", async () => {
    localStorage.setItem("koklo-theme", "system");
    renderWithQuery(<AccountPage />);
    expect(within(await group()).getByRole("radio", { name: "Système" })).toBeChecked();
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("Mon compte : Me prévenir par e-mail", () => {
  it("propriétaire : cinq interrupteurs d'équipe, résumé de la semaine éteint", async () => {
    renderWithQuery(<AccountPage />);
    await screen.findByRole("group", { name: "Me prévenir par e-mail" });
    expect(switches()).toEqual([
      "Validation ou changement d'un client",
      "Pull request à relire",
      "Agent sans nouvelles depuis 20 minutes",
      "Consommation d'IA à 80 %",
      "Résumé de la semaine",
    ]);
    expect(screen.getByRole("switch", { name: "Résumé de la semaine" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    expect(screen.getByRole("switch", { name: "Pull request à relire" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("développeur : sans la consommation d'IA (réservée au propriétaire)", async () => {
    asRole("dev");
    renderWithQuery(<AccountPage />);
    await screen.findByRole("group", { name: "Me prévenir par e-mail" });
    expect(screen.queryByRole("switch", { name: "Consommation d'IA à 80 %" })).toBeNull();
    expect(screen.getAllByRole("switch")).toHaveLength(4);
  });

  it("client : trois interrupteurs", async () => {
    asRole("client");
    renderWithQuery(<AccountPage />);
    await screen.findByRole("group", { name: "Me prévenir par e-mail" });
    expect(switches()).toEqual([
      "Livrable ou écran à valider",
      "Fonctionnalité prête à essayer",
      "Réponse à un commentaire",
    ]);
  });

  it("basculer enregistre aussitôt la clé, retour immédiat", async () => {
    procedures.meUpdateNotification.mockResolvedValue({ key: "weekly_digest", enabled: true });
    renderWithQuery(<AccountPage />);
    const toggle = await screen.findByRole("switch", { name: "Résumé de la semaine" });
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-checked", "true");
    await waitFor(() =>
      expect(procedures.meUpdateNotification.mock.calls[0]?.[0]).toEqual({
        key: "weekly_digest",
        enabled: true,
      }),
    );
  });

  it("échec : retour arrière et message", async () => {
    procedures.meUpdateNotification.mockRejectedValue(apiError("INTERNAL"));
    renderWithQuery(<AccountPage />);
    const toggle = await screen.findByRole("switch", { name: "Résumé de la semaine" });
    await userEvent.click(toggle);
    await waitFor(() => expect(toggle).toHaveAttribute("aria-checked", "false"));
    expect(await screen.findByRole("alert")).toHaveTextContent("Impossible d'enregistrer");
  });

  it("l'interrupteur se pilote au clavier (Espace)", async () => {
    procedures.meUpdateNotification.mockResolvedValue({ key: "pr_to_review", enabled: false });
    renderWithQuery(<AccountPage />);
    const toggle = await screen.findByRole("switch", { name: "Pull request à relire" });
    toggle.focus();
    await userEvent.keyboard(" ");
    expect(toggle).toHaveAttribute("aria-checked", "false");
  });
});

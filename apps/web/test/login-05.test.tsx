import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import LoginPage from "../src/app/login/page.tsx";

const social = vi.hoisted(() => vi.fn());
vi.mock("../src/lib/auth-client.ts", () => ({ authClient: { signIn: { social } } }));

beforeEach(() => social.mockReset());

describe("S-login v2 (login-05) : contenu retenu", () => {
  it("affiche h1, phrase d'accroche et un unique bouton GitHub, sans champ de saisie", () => {
    render(<LoginPage />);
    expect(
      screen.getByRole("heading", { level: 1, name: "Connexion à Koklo" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Connectez-vous avec votre compte GitHub pour accéder à vos projets."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByLabelText(/mot de passe|e-?mail/i)).toBeNull();
  });

  it("n'expose qu'un seul fournisseur : GitHub (ni Apple, ni Google, ni inscription)", () => {
    render(<LoginPage />);
    const page = screen.getByTestId("login-page");
    for (const out of [/apple/i, /google/i, /mot de passe oublié/i, /s'inscrire|inscription/i]) {
      expect(page).not.toHaveTextContent(out);
    }
    const providers = screen
      .getAllByRole("button")
      .filter((b) => !/thème/.test(b.getAttribute("aria-label") ?? ""));
    expect(providers).toHaveLength(1);
    expect(providers[0]).toHaveAccessibleName(/Continuer avec GitHub/);
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("mise en page : fond bg-muted, carte max-w-sm, logo K, bascule de thème", () => {
    render(<LoginPage />);
    const page = screen.getByTestId("login-page");
    expect(page.classList.contains("bg-muted")).toBe(true);
    expect(page.querySelector(".max-w-sm")).not.toBeNull();
    expect(page).toHaveTextContent("K");
    expect(screen.getByRole("button", { name: "Passer au thème sombre" })).toBeInTheDocument();
  });

  it("la bascule de thème précède le bouton GitHub dans l'ordre de focus", async () => {
    render(<LoginPage />);
    await userEvent.tab();
    expect(screen.getByRole("button", { name: "Passer au thème sombre" })).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole("button", { name: /Continuer avec GitHub/ })).toHaveFocus();
  });
});

describe("S-login v2 (login-05) : états", () => {
  it("états : redirection (aria-busy) puis échec avec alerte, bouton réactivé", async () => {
    social.mockReturnValueOnce(new Promise(() => undefined));
    const { unmount } = render(<LoginPage />);
    await userEvent.click(screen.getByRole("button", { name: /Continuer avec GitHub/ }));
    expect(await screen.findByRole("button", { name: /Redirection vers GitHub…/ })).toHaveAttribute(
      "aria-busy",
      "true",
    );
    unmount();
    social.mockRejectedValueOnce(new Error("boom"));
    render(<LoginPage />);
    await userEvent.click(screen.getByRole("button", { name: /Continuer avec GitHub/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "La connexion avec GitHub a échoué. Réessayez.",
    );
    expect(screen.getByRole("button", { name: /Continuer avec GitHub/ })).toBeEnabled();
  });
});

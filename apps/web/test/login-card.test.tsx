import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LoginCard } from "../src/components/login-card.tsx";

// Frontière externe : le client Better Auth (réseau + redirection OAuth).
const social = vi.hoisted(() => vi.fn());
vi.mock("../src/lib/auth-client.ts", () => ({ authClient: { signIn: { social } } }));

beforeEach(() => {
  social.mockReset();
});

describe("LoginCard", () => {
  it("expose un vrai bouton « Continuer avec GitHub » et un h1 unique", () => {
    social.mockResolvedValue({});
    render(<LoginCard />);
    expect(screen.getByRole("button", { name: /Continuer avec GitHub/ })).toBeEnabled();
    expect(
      screen.getByRole("heading", { level: 1, name: "Connexion à Koklo" }),
    ).toBeInTheDocument();
  });

  it("lance la connexion GitHub avec retour vers /projects", async () => {
    social.mockResolvedValue({});
    render(<LoginCard />);
    await userEvent.click(screen.getByRole("button", { name: /Continuer avec GitHub/ }));
    expect(social).toHaveBeenCalledWith({ provider: "github", callbackURL: "/projects" });
  });

  it("passe en état occupé et désactivé pendant la redirection", async () => {
    social.mockReturnValue(new Promise(() => undefined));
    render(<LoginCard />);
    await userEvent.click(screen.getByRole("button", { name: /Continuer avec GitHub/ }));
    const busy = await screen.findByRole("button", { name: /Redirection vers GitHub…/ });
    expect(busy).toBeDisabled();
    expect(busy).toHaveAttribute("aria-busy", "true");
  });

  it("affiche une alerte lisible si la connexion échoue, et réactive le bouton", async () => {
    social.mockRejectedValue(new Error("boom"));
    render(<LoginCard />);
    await userEvent.click(screen.getByRole("button", { name: /Continuer avec GitHub/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "La connexion avec GitHub a échoué. Réessayez.",
    );
    expect(screen.getByRole("button", { name: /Continuer avec GitHub/ })).toBeEnabled();
  });
});

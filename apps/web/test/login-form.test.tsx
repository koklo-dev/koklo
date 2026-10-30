import { render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import LoginPage from "../src/app/login/page.tsx";
import { LoginForm } from "../src/components/login-form.tsx";
import { findNamed } from "./support/wait.ts";

// Frontière externe : le client Better Auth (réseau + redirection OAuth).
const social = vi.hoisted(() => vi.fn());
vi.mock("../src/lib/auth-client.ts", () => ({ authClient: { signIn: { social } } }));

beforeEach(() => {
  social.mockReset();
});

const GITHUB = /Continuer avec GitHub/;

describe("cas 6 : LoginForm (bloc login-05 installé)", () => {
  it("garde la structure du bloc : FieldGroup, un seul bouton GitHub, notice de redirection", () => {
    const { container } = render(<LoginForm />);
    expect(container.querySelector('[data-slot="field-group"]')).not.toBeNull();
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.getByRole("button", { name: GITHUB })).toBeEnabled();
    expect(
      screen.getByText("Vous serez redirigé vers GitHub pour vous authentifier."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 1, name: "Connexion à Koklo" }),
    ).toBeInTheDocument();
  });

  it("n'a ni champ e-mail, ni séparateur « Or », ni Apple/Google/inscription, ni lien", () => {
    const { container } = render(<LoginForm />);
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByLabelText(/mot de passe|e-?mail/i)).toBeNull();
    expect(container.querySelector('[data-slot="field-separator"]')).toBeNull();
    expect(screen.queryByText(/^(or|ou)$/i)).toBeNull();
    for (const out of [/apple/i, /google/i, /s'inscrire|inscription|sign up/i, /conditions/i]) {
      expect(container).not.toHaveTextContent(out);
    }
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("le clic appelle signIn.social({ provider: 'github', callbackURL: '/projects' })", async () => {
    social.mockResolvedValue({});
    render(<LoginForm />);
    await userEvent.click(screen.getByRole("button", { name: GITHUB }));
    expect(social).toHaveBeenCalledTimes(1);
    expect(social).toHaveBeenCalledWith({ provider: "github", callbackURL: "/projects" });
  });

  it("état redirecting : bouton désactivé, aria-busy, libellé « Redirection vers GitHub… »", async () => {
    social.mockReturnValue(new Promise(() => undefined));
    render(<LoginForm />);
    await userEvent.click(screen.getByRole("button", { name: GITHUB }));
    const busy = await findNamed("button", /Redirection vers GitHub…/);
    expect(busy).toBeDisabled();
    expect(busy).toHaveAttribute("aria-busy", "true");
  });

  it.each([
    ["rejet", () => social.mockRejectedValue(new Error("boom"))],
    ["résultat en erreur", () => social.mockResolvedValue({ error: { message: "x" } })],
  ])("état failed (%s) : alerte annoncée et bouton réactivé", async (_label, arrange) => {
    arrange();
    render(<LoginForm />);
    await userEvent.click(screen.getByRole("button", { name: GITHUB }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "La connexion avec GitHub a échoué. Réessayez.",
    );
    expect(screen.getByRole("button", { name: GITHUB })).toBeEnabled();
  });
});

describe("cas 6 : page /login", () => {
  it("page centrée bg-muted, logo K, un h1, bascule de thème nommée", () => {
    render(<LoginPage />);
    const page = screen.getByTestId("login-page");
    // biome-ignore-start lint/correctness/noPlaywrightMissingAwait: matchers jest-dom synchrones (jsdom)
    expect(page).toHaveClass("bg-muted");
    expect(page).toHaveClass("items-center");
    // biome-ignore-end lint/correctness/noPlaywrightMissingAwait: idem
    expect(within(page).getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(page).toHaveTextContent("K");
    expect(screen.getByRole("button", { name: "Passer au thème sombre" })).toBeInTheDocument();
  });

  it("le seul bouton de connexion est GitHub (hors bascule de thème)", () => {
    render(<LoginPage />);
    const others = screen
      .getAllByRole("button")
      .filter((b) => !/thème/.test(b.getAttribute("aria-label") ?? ""));
    expect(others).toHaveLength(1);
    expect(others[0]).toHaveAccessibleName(GITHUB);
  });

  it("la bascule de thème précède le bouton GitHub dans l'ordre de focus", async () => {
    render(<LoginPage />);
    await userEvent.tab();
    expect(screen.getByRole("button", { name: "Passer au thème sombre" })).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole("button", { name: GITHUB })).toHaveFocus();
  });
});

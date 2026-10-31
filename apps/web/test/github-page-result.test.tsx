import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GithubPage } from "../src/components/github-page.tsx";
import { asRole, INSTALL_ID_1, installation } from "./support/github-fixtures.ts";
import { renderWithQuery } from "./support/render.tsx";
import { polyfillRadix, procedures, resetWebMocks, router } from "./support/web-mocks.ts";

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

beforeEach(() => {
  resetWebMocks();
  polyfillRadix();
  asRole("owner");
  procedures.installationList.mockResolvedValue([installation({ id: INSTALL_ID_1 })]);
});

const RESULTS = [
  [
    "installed",
    "status",
    "Application GitHub installée",
    "Le compte est relié à votre organisation.",
  ],
  [
    "denied",
    "alert",
    "Installation non terminée",
    "GitHub n'a pas confirmé votre accès à cette installation",
  ],
  [
    "invalid_state",
    "alert",
    "Ce retour depuis GitHub n'est plus valable",
    "Pour votre sécurité, il dure 10 minutes",
  ],
  [
    "already_linked",
    "alert",
    "Installation déjà utilisée",
    "déjà reliée à une autre organisation Koklo",
  ],
  [
    "not_owner",
    "alert",
    "Seul le propriétaire du compte peut faire cette liaison",
    "pour une organisation GitHub, il faut en être administrateur",
  ],
  [
    "provider_error",
    "alert",
    "GitHub n'a pas répondu comme prévu",
    "Rien n'a été enregistré. Réessayez dans quelques minutes.",
  ],
] as const;

/** Le message de retour : celui-là seul, hors liste de chargement (un seul `role=alert`/`status` pertinent). */
const noticeWithTitle = (role: "status" | "alert", title: string) =>
  screen.queryAllByRole(role).find((el) => el.textContent?.includes(title));

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas du retour de GitHub, un test par comportement
describe("S-github — retour de GitHub ?result= (AC-48-16)", () => {
  it.each(RESULTS)(
    "%s : message en role=%s avec titre et texte",
    async (outcome, role, title, text) => {
      renderWithQuery(<GithubPage result={outcome} />);
      await screen.findByText(title);
      const notice = noticeWithTitle(role, title);
      expect(notice, `${outcome}: pas de ${role} avec « ${title} »`).toBeDefined();
      expect(notice).toHaveTextContent(text);
      expect(notice?.querySelector("svg")).not.toBeNull();
      const other = role === "status" ? "alert" : "status";
      expect(noticeWithTitle(other, title)).toBeUndefined();
      if (outcome === "installed") expect(screen.queryAllByRole("alert")).toHaveLength(0);
    },
  );

  it.each(RESULTS)(
    "%s : le paramètre est retiré de l'URL (/github, sans nouvelle entrée d'historique)",
    async (outcome, _role, title) => {
      renderWithQuery(<GithubPage result={outcome} />);
      await screen.findByText(title);
      expect(router.replace).toHaveBeenCalledWith("/github", { scroll: false });
      expect(router.push).not.toHaveBeenCalled();
    },
  );

  it("la liste est rechargée au retour (installed) : une installation apparaît", async () => {
    renderWithQuery(<GithubPage result="installed" />);
    expect(await screen.findByRole("heading", { level: 2, name: "acme-corp" })).toBeInTheDocument();
    expect(procedures.installationList).toHaveBeenCalled();
  });

  it("le message est conservé après le retrait du paramètre (l'état de la page le porte)", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const withClient = (ui: ReactElement) => (
      <QueryClientProvider client={client}>{ui}</QueryClientProvider>
    );
    const { rerender } = render(withClient(<GithubPage result="installed" />));
    await screen.findByText("Application GitHub installée");
    await waitFor(() => expect(router.replace).toHaveBeenCalled());
    // La navigation retire le paramètre : le composant est re-rendu sans `result`, le message reste.
    rerender(withClient(<GithubPage />));
    expect(screen.getByText("Application GitHub installée")).toBeInTheDocument();
  });

  it("sans paramètre : aucun message de retour et aucun remplacement d'URL", async () => {
    renderWithQuery(<GithubPage />);
    await screen.findByRole("heading", { level: 2, name: "acme-corp" });
    for (const [, , title] of RESULTS) expect(screen.queryByText(title)).not.toBeInTheDocument();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("une valeur inconnue (typée à tort) n'affiche rien et n'est jamais rendue dans le DOM", async () => {
    const hostile = "<img src=x onerror=alert(1)>";
    renderWithQuery(<GithubPage result={hostile as never} />);
    await screen.findByRole("heading", { level: 2, name: "acme-corp" });
    expect(screen.getByTestId("github-page").innerHTML).not.toContain("onerror");
    expect(screen.getByTestId("github-page").textContent).not.toContain(hostile);
    for (const [, , title] of RESULTS) expect(screen.queryByText(title)).not.toBeInTheDocument();
  });

  it("la valeur brute d'un résultat connu n'apparaît jamais dans le DOM", async () => {
    renderWithQuery(<GithubPage result="invalid_state" />);
    await screen.findByText("Ce retour depuis GitHub n'est plus valable");
    expect(screen.getByTestId("github-page").textContent).not.toContain("invalid_state");
  });

  it("le message disparaît au prochain clic d'action, sans minuterie", async () => {
    const { userEvent } = await import("@testing-library/user-event");
    procedures.installationStart.mockReturnValue(new Promise(() => undefined));
    renderWithQuery(<GithubPage result="denied" />);
    await screen.findByText("Installation non terminée");
    await userEvent.click(
      await screen.findByRole("button", { name: "Installer l'application GitHub" }),
    );
    await waitFor(() =>
      expect(screen.queryByText("Installation non terminée")).not.toBeInTheDocument(),
    );
  });

  it("un non-gestionnaire ne voit pas le message de résultat, seulement le refus", async () => {
    asRole("dev");
    renderWithQuery(<GithubPage result="installed" />);
    await screen.findByText(/réservée aux propriétaires/);
    expect(screen.queryByText("Application GitHub installée")).not.toBeInTheDocument();
  });
});

import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GithubPage } from "../src/components/github-page.tsx";
import { CREATION_RESUME_KEY } from "../src/lib/creation-resume.ts";
import { asRole, INSTALL_ID_1, installation } from "./support/github-fixtures.ts";
import { renderWithQuery } from "./support/render.tsx";
import { polyfillRadix, procedures, resetWebMocks } from "./support/web-mocks.ts";

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

const PROJECT_ID = "7d1f6c1e-0b0a-4c55-9d63-1d2f7d6a1b01";
const marker = (over: Record<string, unknown> = {}) => ({
  projectId: PROJECT_ID,
  projectName: "Alpha",
  installationId: INSTALL_ID_1,
  savedAt: Date.now() - 60_000,
  ...over,
});
const store = (value: unknown) =>
  sessionStorage.setItem(CREATION_RESUME_KEY, JSON.stringify(value));
const LINK = "Reprendre la création du projet « Alpha »";

beforeEach(() => {
  resetWebMocks();
  polyfillRadix();
  sessionStorage.clear();
  asRole("owner");
  procedures.installationList.mockResolvedValue([installation()]);
});

/** S-github v3 : retour de GitHub avec un marqueur de reprise (design/screens/S-projects.md §5.1). */
// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("S-github — lien « Reprendre la création du projet » (§5.1)", () => {
  it("résultat installed + marqueur valide : lien vers /projects", async () => {
    store(marker());
    renderWithQuery(<GithubPage result="installed" />);
    const link = await screen.findByRole("link", { name: LINK });
    expect(link).toHaveAttribute("href", "/projects");
  });

  it("le lien est dans le message de résultat, pas ailleurs", async () => {
    store(marker());
    renderWithQuery(<GithubPage result="installed" />);
    const link = await screen.findByRole("link", { name: LINK });
    const status = screen.getAllByRole("status").find((el) => el.contains(link));
    expect(status).toBeDefined();
    expect(status).toHaveTextContent("Application GitHub installée");
  });

  it.each(["denied", "invalid_state", "already_linked", "not_owner", "provider_error"] as const)(
    "résultat %s : aucun lien (rien n'a été autorisé)",
    async (result) => {
      store(marker());
      renderWithQuery(<GithubPage result={result} />);
      await screen.findByRole("alert");
      expect(screen.queryByRole("link", { name: /Reprendre la création/ })).not.toBeInTheDocument();
    },
  );

  it("installed sans marqueur : aucun lien", async () => {
    renderWithQuery(<GithubPage result="installed" />);
    await screen.findByText("Application GitHub installée");
    expect(screen.queryByRole("link", { name: /Reprendre la création/ })).not.toBeInTheDocument();
  });

  it("sans résultat dans l'URL, même avec un marqueur valide : aucun lien", async () => {
    store(marker());
    renderWithQuery(<GithubPage />);
    await screen.findByRole("heading", { level: 2, name: "acme-corp" });
    expect(screen.queryByRole("link", { name: /Reprendre la création/ })).not.toBeInTheDocument();
  });

  it("marqueur expiré (> 1 h) : aucun lien", async () => {
    store(marker({ savedAt: Date.now() - 61 * 60_000 }));
    renderWithQuery(<GithubPage result="installed" />);
    await screen.findByText("Application GitHub installée");
    expect(screen.queryByRole("link", { name: /Reprendre la création/ })).not.toBeInTheDocument();
  });

  it("marqueur malformé ou avec un champ en trop : aucun lien, aucune erreur", async () => {
    store(marker({ accessToken: "ghu_x" }));
    renderWithQuery(<GithubPage result="installed" />);
    await screen.findByText("Application GitHub installée");
    expect(screen.queryByRole("link", { name: /Reprendre la création/ })).not.toBeInTheDocument();
  });

  it("le nom du projet est rendu comme du texte, jamais comme du HTML", async () => {
    store(marker({ projectName: "<img src=x onerror=alert(1)>" }));
    renderWithQuery(<GithubPage result="installed" />);
    const link = await screen.findByRole("link", {
      name: "Reprendre la création du projet « <img src=x onerror=alert(1)> »",
    });
    expect(link.querySelector("img")).toBeNull();
    expect(document.querySelector("img[src='x']")).toBeNull();
  });
});

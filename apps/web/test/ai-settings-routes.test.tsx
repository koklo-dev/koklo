import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AiSettingsLayout from "../src/app/settings/ai/layout.tsx";
import Page, { metadata } from "../src/app/settings/ai/page.tsx";
import { AiSettingsPage } from "../src/components/ai-settings-page.tsx";
import { asRole } from "./support/github-fixtures.ts";
import { pathname, polyfillRadix, procedures, resetWebMocks } from "./support/web-mocks.ts";
import { DESKTOP, setViewport } from "./viewport.ts";

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

/** Réglages de l'IA : page serveur, gabarit, fil d'Ariane et entrée de navigation (S-ai-settings §2, §7, §11). */
beforeEach(() => {
  resetWebMocks();
  polyfillRadix();
  setViewport(DESKTOP);
  localStorage.clear();
  procedures.projectList.mockResolvedValue([]);
  procedures.llmCredentialList.mockResolvedValue({ items: [] });
});

function renderLayout() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AiSettingsLayout>
        <h1>IA</h1>
      </AiSettingsLayout>
    </QueryClientProvider>,
  );
}

const sidebar = () => document.querySelector('[data-slot="sidebar"]') as HTMLElement;
const linkNames = () =>
  within(sidebar())
    .getAllByRole("link")
    .map((el) => el.textContent?.trim());

describe("/settings/ai — page serveur", () => {
  it("titre « IA · Koklo »", () => {
    expect(metadata.title).toBe("IA · Koklo");
  });

  it("rend l'écran des réglages de l'IA, sans paramètre de recherche lu", () => {
    expect(Page()).toMatchObject({ type: AiSettingsPage });
  });
});

describe("/settings/ai — fil d'Ariane « Koklo > Réglages > IA »", () => {
  it("« Réglages » est un maillon non cliquable, « IA » la page courante", () => {
    renderLayout();
    const crumbs = screen.getByRole("navigation", { name: /breadcrumb|fil d'ariane/i });
    expect(within(crumbs).getByText("Koklo")).toBeInTheDocument();
    const settings = within(crumbs).getByText("Réglages");
    expect(settings.closest("a")).toBeNull();
    expect(settings.closest("button")).toBeNull();
    expect(within(crumbs).getByText("IA")).toHaveAttribute("aria-current", "page");
  });

  it("aucune page /settings : aucun lien du document ne mène à /settings", () => {
    renderLayout();
    const hrefs = Array.from(document.querySelectorAll("a[href]")).map((a) =>
      a.getAttribute("href"),
    );
    expect(hrefs).not.toContain("/settings");
  });
});

describe("/settings/ai — entrée « IA » de la navigation", () => {
  it.each(["owner", "admin"])(
    "rôle %s : entrée « IA » vers /settings/ai, après « GitHub »",
    async (role) => {
      asRole(role);
      renderLayout();
      const link = await within(sidebar()).findByRole("link", { name: "IA" });
      expect(link).toHaveAttribute("href", "/settings/ai");
      const names = linkNames();
      expect(names.indexOf("IA")).toBe(names.indexOf("GitHub") + 1);
    },
  );

  it("sur /settings/ai l'entrée porte aria-current=page", async () => {
    asRole("owner");
    pathname.current = "/settings/ai";
    renderLayout();
    expect(await within(sidebar()).findByRole("link", { name: "IA" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("hors de /settings/ai l'entrée n'est pas courante", async () => {
    asRole("owner");
    pathname.current = "/github";
    renderLayout();
    expect(await within(sidebar()).findByRole("link", { name: "IA" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it.each(["dev", "designer", "client", "business"])(
    "rôle %s : aucune entrée « IA » dans la navigation",
    async (role) => {
      asRole(role);
      renderLayout();
      await within(sidebar()).findByRole("link", { name: "Projets" });
      await within(sidebar()).findAllByText("Atelier Lumière");
      expect(within(sidebar()).queryByRole("link", { name: "IA" })).toBeNull();
    },
  );

  it("rôle inconnu (fail-closed) : entrée absente tant que organization.list n'a pas répondu", async () => {
    procedures.organizationList.mockReturnValue(new Promise(() => undefined));
    renderLayout();
    await within(sidebar()).findByRole("link", { name: "Projets" });
    expect(within(sidebar()).queryByRole("link", { name: "IA" })).toBeNull();
  });

  it("n'enlève aucune entrée existante et n'appelle aucune procédure llmCredential", async () => {
    asRole("owner");
    renderLayout();
    await within(sidebar()).findByRole("link", { name: "IA" });
    expect(linkNames()).toEqual(expect.arrayContaining(["Projets", "Kanban", "Membres", "GitHub"]));
    expect(procedures.llmCredentialList).not.toHaveBeenCalled();
  });
});

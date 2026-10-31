import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import GithubLayout from "../src/app/github/layout.tsx";
import Page, { metadata } from "../src/app/github/page.tsx";
import { GithubPage } from "../src/components/github-page.tsx";
import { asRole } from "./support/github-fixtures.ts";
import { polyfillRadix, procedures, resetWebMocks } from "./support/web-mocks.ts";
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

beforeEach(() => {
  resetWebMocks();
  polyfillRadix();
  setViewport(DESKTOP);
  localStorage.clear();
  procedures.installationList.mockResolvedValue([]);
  procedures.projectList.mockResolvedValue([]);
});

function renderLayout() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <GithubLayout>
        <h1>GitHub</h1>
      </GithubLayout>
    </QueryClientProvider>,
  );
}

const sidebar = () => document.querySelector('[data-slot="sidebar"]') as HTMLElement;

describe("/github — page serveur (AC-48-16)", () => {
  it("titre « GitHub · Koklo »", () => {
    expect(metadata.title).toBe("GitHub · Koklo");
  });

  it.each([
    "installed",
    "denied",
    "invalid_state",
    "already_linked",
    "not_owner",
    "provider_error",
  ])("transmet le résultat valide « %s » à GithubPage", async (result) => {
    const element = await Page({ searchParams: Promise.resolve({ result }) });
    expect(element).toMatchObject({ type: GithubPage, props: { result } });
  });

  it.each([
    ["inconnu", { result: "pwned" }],
    ["script", { result: "<script>alert(1)</script>" }],
    ["tableau", { result: ["installed", "denied"] }],
    ["absent", {}],
    ["vide", { result: "" }],
  ])("valeur %s : ignorée (result absent)", async (_label, searchParams) => {
    const element = await Page({ searchParams: Promise.resolve(searchParams) });
    expect(element).toMatchObject({ type: GithubPage });
    expect((element as unknown as { props: { result?: unknown } }).props.result).toBeUndefined();
  });
});

describe("/github — gabarit et navigation (AC-48-17)", () => {
  it("fil d'Ariane « Koklo > GitHub » (page courante GitHub)", () => {
    renderLayout();
    const crumbs = screen.getByRole("navigation", { name: /breadcrumb|fil d'ariane/i });
    expect(within(crumbs).getByText("GitHub")).toHaveAttribute("aria-current", "page");
  });

  it.each(["owner", "admin"])(
    "rôle %s : entrée « GitHub » vers /github après « Membres »",
    async (role) => {
      asRole(role);
      renderLayout();
      const link = await within(sidebar()).findByRole("link", { name: "GitHub" });
      expect(link).toHaveAttribute("href", "/github");
      const names = within(sidebar())
        .getAllByRole("link")
        .map((el) => el.textContent?.trim());
      expect(names.indexOf("GitHub")).toBe(names.indexOf("Membres") + 1);
    },
  );

  it("sur /github l'entrée porte aria-current=page", async () => {
    asRole("owner");
    const { pathname } = await import("./support/web-mocks.ts");
    pathname.current = "/github";
    renderLayout();
    expect(await within(sidebar()).findByRole("link", { name: "GitHub" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it.each(["dev", "designer", "client", "business"])(
    "rôle %s : aucune entrée « GitHub » dans la navigation",
    async (role) => {
      asRole(role);
      renderLayout();
      await within(sidebar()).findByRole("link", { name: "Membres" });
      await within(sidebar()).findAllByText("Atelier Lumière");
      expect(within(sidebar()).queryByRole("link", { name: "GitHub" })).toBeNull();
    },
  );

  it("rôle inconnu : entrée absente tant que organization.list n'a pas répondu", async () => {
    procedures.organizationList.mockReturnValue(new Promise(() => undefined));
    renderLayout();
    await within(sidebar()).findByRole("link", { name: "Membres" });
    expect(within(sidebar()).queryByRole("link", { name: "GitHub" })).toBeNull();
  });
});

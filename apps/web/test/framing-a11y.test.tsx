import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import FramingLayout from "../src/app/projects/[projectId]/framing/layout.tsx";
import * as route from "../src/app/projects/[projectId]/framing/page.tsx";
import { PROJECT_ID } from "./support/features.tsx";
import {
  accept,
  askConfirmation,
  card,
  GENERATE,
  generateBrief,
  openFraming,
  proposeFeatures,
  serveFraming,
  T1,
} from "./support/framing.tsx";
import { findNamed } from "./support/wait.ts";
import {
  pathname,
  polyfillRadix,
  procedures,
  resetWebMocks,
  setUrl,
  watchUrl,
} from "./support/web-mocks.ts";
import { DESKTOP, MOBILE, setViewport } from "./viewport.ts";

vi.mock("next/navigation", async () => {
  const m = await import("./support/web-mocks.ts");
  return {
    useRouter: () => m.router,
    usePathname: () => m.pathname.current,
    useSearchParams: m.useSearchParams,
  };
});
vi.mock("../src/lib/auth-client.ts", async () => ({
  authClient: (await import("./support/web-mocks.ts")).authClient,
}));
vi.mock("../src/lib/orpc.ts", async () => ({
  orpc: (await import("./support/web-mocks.ts")).orpc,
}));

/**
 * TK-59, route, gabarit, accessibilité (S-framing §7), responsive 375 px (§6) et conformité visuelle. Axe en
 * clair et en sombre : voir apps/web/e2e/framing.spec.ts (jsdom ne calcule ni contrastes ni mise en page).
 */
beforeEach(() => {
  resetWebMocks();
  polyfillRadix();
  watchUrl();
  localStorage.clear();
  setViewport(DESKTOP);
  serveFraming();
});

const client = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

describe("Route /projects/[projectId]/framing", () => {
  it("titre de page « Cadrage · Koklo »", () => {
    const { metadata } = route as { metadata?: { title?: string } };
    expect(metadata?.title).toBe("Cadrage · Koklo");
  });

  it("la page rend l'écran du projet de l'adresse (params asynchrones)", async () => {
    setUrl(`/projects/${PROJECT_ID}/framing`);
    const element = await route.default({ params: Promise.resolve({ projectId: PROJECT_ID }) });
    render(<QueryClientProvider client={client()}>{element}</QueryClientProvider>);
    expect(await findNamed("heading", "Cadrage", { level: 1 })).toBeInTheDocument();
    expect(procedures.specHead.mock.calls[0]?.[0]).toMatchObject({ projectId: PROJECT_ID });
  });

  it("dans le gabarit : un seul main, un seul h1, la barre latérale", async () => {
    pathname.current = `/projects/${PROJECT_ID}/framing`;
    setUrl(`/projects/${PROJECT_ID}/framing`);
    const element = await route.default({ params: Promise.resolve({ projectId: PROJECT_ID }) });
    render(
      <QueryClientProvider client={client()}>
        <FramingLayout>{element}</FramingLayout>
      </QueryClientProvider>,
    );
    await findNamed("heading", "Cadrage", { level: 1 });
    expect(screen.getAllByRole("main")).toHaveLength(1);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(document.querySelector('[data-slot="sidebar"]')).not.toBeNull();
  });
});

describe("Chargement (§4.1)", () => {
  it("role=status aria-busy « Chargement du cadrage… », aucun appel ai.*", async () => {
    procedures.specHead.mockReturnValue(new Promise(() => undefined));
    procedures.projectList.mockReturnValue(new Promise(() => undefined));
    const { renderFraming } = await import("./support/framing.tsx");
    renderFraming();
    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent("Chargement du cadrage…");
    expect(status).toHaveAttribute("aria-busy", "true");
    expect(procedures.aiDraftBrief).not.toHaveBeenCalled();
    expect(procedures.aiProposeFeatures).not.toHaveBeenCalled();
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("Accessibilité (§7)", () => {
  it("repères : main, un h1, h2 par étape, h3 par proposition, régions nommées par leur h2", async () => {
    await openFraming();
    await proposeFeatures();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual([
      "1. Votre idée",
      "2. Le brief",
      "3. Les propositions",
    ]);
    expect(
      screen.getAllByRole("heading", { level: 3, name: /Réserver|Annuler|Rappel/ }),
    ).toHaveLength(3);
    expect(screen.getByRole("region", { name: "3. Les propositions" })).toBeVisible();
  });

  it("une seule région d'état polie ; au plus une alerte d'échec à la fois", async () => {
    await openFraming();
    await proposeFeatures();
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
    expect(screen.queryAllByRole("alert").length).toBeLessThanOrEqual(1);
  });

  it("tous les champs ont un label visible ; aucun tabindex positif", async () => {
    await openFraming();
    await generateBrief();
    for (const field of screen.getAllByRole("textbox")) {
      expect(field, "champ sans nom accessible").toHaveAccessibleName();
      expect(
        document.querySelector(`label[for="${field.id}"]`),
        `label manquant pour ${field.id}`,
      ).not.toBeNull();
    }
    expect(
      document.querySelector("[tabindex]:not([tabindex='-1']):not([tabindex='0'])"),
    ).toBeNull();
  });

  it("icônes décoratives en aria-hidden ; tout bouton d'icône seul a un aria-label", async () => {
    await openFraming();
    await proposeFeatures();
    for (const icon of document.querySelectorAll("svg"))
      expect(icon).toHaveAttribute("aria-hidden", "true");
    for (const button of screen.getAllByRole("button")) {
      expect(button, "bouton sans nom").toHaveAccessibleName();
    }
  });

  it("statut jamais par la couleur seule : chaque badge porte une icône et un libellé", async () => {
    await openFraming();
    await proposeFeatures();
    await accept(T1);
    for (const label of ["Acceptée", "À relire"]) {
      for (const badge of within(card(T1)).queryAllByText(label)) {
        const holder = badge.closest("[data-slot='badge']") as HTMLElement;
        expect(holder.querySelector("svg[aria-hidden='true']")).not.toBeNull();
      }
    }
  });

  it("ordre de tabulation : onglets, champs, bouton d'appel ; puis pour chaque carte Accepter, Rejeter, Modifier", async () => {
    await openFraming();
    const order = () =>
      Array.from(
        document.querySelectorAll<HTMLElement>(
          "button, a[href], input, textarea, [role='tab'], [role='combobox']",
        ),
      )
        .map((el) => el.getAttribute("aria-label") ?? el.textContent?.trim() ?? "")
        .filter(Boolean);
    const first = order();
    expect(first.indexOf("Partir d'une idée")).toBeLessThan(first.indexOf(GENERATE));
    await proposeFeatures();
    const all = order();
    const at = (label: string, from = 0) => all.indexOf(label, from);
    const accept1 = at("Accepter");
    expect(at("Rejeter", accept1)).toBeGreaterThan(accept1);
    expect(at("Modifier", accept1)).toBeGreaterThan(at("Rejeter", accept1));
  });

  it("récapitulatif : aucun piège de focus (pas de dialogue modal)", async () => {
    await openFraming();
    await proposeFeatures();
    await accept(T1);
    await askConfirmation();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.querySelector("[aria-modal='true']")).toBeNull();
  });

  it("mouvement réduit : aucune animation hors motion-safe", async () => {
    await openFraming();
    await proposeFeatures();
    const classes = Array.from(document.querySelectorAll("[class]")).map(
      (el) => el.getAttribute("class") ?? "",
    );
    for (const value of classes) {
      for (const token of value.split(/\s+/)) {
        if (/^(?:animate-|transition-)/.test(token)) {
          expect(token, "animation sans motion-safe").toMatch(/^motion-safe:/);
        }
      }
    }
  });

  it("vocabulaire : jamais commit, branche, lot, prompt ni token dans une phrase d'état", async () => {
    await openFraming();
    await proposeFeatures();
    await accept(T1);
    const text = screen.getByRole("status").textContent ?? "";
    expect(text).not.toMatch(/\b(commit|branche|lot|prompt|token)\b/i);
  });
});

describe("Mobile 375 px (§6)", () => {
  beforeEach(() => setViewport(MOBILE));

  it("boutons d'appel et d'action à 44 px (h-11), pleine largeur, onglets pleine largeur", async () => {
    await openFraming();
    const call = screen.getByRole("button", { name: GENERATE });
    expect(call.className).toMatch(/\bh-11\b/);
    expect(call.className).toMatch(/\bw-full\b/);
    expect(screen.getByRole("tablist").className).toMatch(/\bw-full\b/);
  });

  it("cartes : Accepter et Rejeter côte à côte, Modifier en dessous, 44 px", async () => {
    await openFraming();
    await proposeFeatures();
    const item = within(card(T1));
    for (const name of ["Accepter", "Rejeter", "Modifier"]) {
      expect(item.getByRole("button", { name }).className).toMatch(/\bh-11\b/);
    }
    const pair = item.getByRole("button", { name: "Accepter" }).parentElement as HTMLElement;
    expect(pair).toContainElement(item.getByRole("button", { name: "Rejeter" }));
    expect(pair).not.toContainElement(item.getByRole("button", { name: "Modifier" }));
  });

  it("barre d'enregistrement collante en bas (sticky bottom-0), fond --background, bordure haute", async () => {
    await openFraming();
    await proposeFeatures();
    await accept(T1);
    const bar = screen
      .getByRole("button", { name: /^Enregistrer 1/ })
      .closest("[data-slot='framing-save-bar']") as HTMLElement;
    expect(bar).not.toBeNull();
    expect(bar.className).toMatch(/\bsticky\b/);
    expect(bar.className).toMatch(/\bbottom-0\b/);
    expect(bar.className).toMatch(/\bbg-background\b/);
    expect(bar.className).toMatch(/\bborder-t\b/);
  });

  it("les titres longs passent à la ligne (jamais tronqués sans title)", async () => {
    await openFraming();
    await proposeFeatures();
    const h3 = screen.getByRole("heading", { level: 3, name: T1 });
    if (/\btruncate\b/.test(h3.className)) expect(h3).toHaveAttribute("title");
    expect(h3.className).toMatch(
      /\bbreak-words\b|\b\[overflow-wrap:anywhere\]\b|\bwrap-anywhere\b/,
    );
  });
});

describe("Clair et sombre (jetons seuls)", () => {
  it("aucune classe de couleur brute dans le DOM rendu, en thème sombre comme en clair", async () => {
    for (const theme of ["", "dark"]) {
      document.documentElement.className = theme;
      const { unmount } = await openFraming().then((view) => view);
      await userEvent.click(screen.getByRole("tab", { name: "J'ai déjà un brief" }));
      const html = document.body.innerHTML;
      expect(html).not.toMatch(
        /\b(?:bg|text|border)-(?:red|green|blue|amber|violet|purple|slate|gray|zinc)-\d{2,3}\b/,
      );
      unmount();
    }
    document.documentElement.className = "";
  });
});

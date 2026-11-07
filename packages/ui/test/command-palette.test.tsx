// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CommandPalette, type CommandPaletteGroup } from "../src/index.ts";

/** TK-88 lot B : CommandPalette (cmdk, shouldFilter false ; recherche serveur B3, anti-rebond 200 ms). */
const GROUPS: CommandPaletteGroup[] = [
  {
    key: "projects",
    label: "Projets",
    items: [{ id: "p1", kind: "Projet", title: "Atelier Nova", href: "/projects/p1" }],
  },
  {
    key: "features",
    label: "Fonctionnalités",
    items: [
      {
        id: "f1",
        kind: "F-001",
        title: "Paiement en ligne",
        href: "/projects/p1/spec/functional?sel=f1",
      },
    ],
  },
  {
    key: "tickets",
    label: "Tickets",
    items: [
      { id: "t1", kind: "TK-1", title: "Corriger la facture", href: "/projects/p1/tickets/t1" },
    ],
  },
];

function setup(props: Partial<React.ComponentProps<typeof CommandPalette>> = {}) {
  const handlers = {
    onOpenChange: vi.fn(),
    onSearch: vi.fn(),
    onSelect: vi.fn(),
    onRetry: vi.fn(),
  };
  const view = render(
    <CommandPalette open status="ready" groups={GROUPS} {...handlers} {...props} />,
  );
  return { ...handlers, ...view };
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});
afterEach(() => vi.useRealTimers());

const user = () => userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

describe("CommandPalette : ouverture", () => {
  it("fermée : rien dans le DOM", () => {
    setup({ open: false });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("ouverte : dialogue « Recherche », champ combobox avec son invite, liste listbox", () => {
    setup();
    expect(screen.getByRole("dialog", { name: "Recherche" })).toBeVisible();
    const input = screen.getByRole("combobox");
    expect(input).toHaveAttribute(
      "placeholder",
      "Rechercher un projet, une fonctionnalité, un ticket",
    );
    expect(screen.getByRole("listbox")).toBeVisible();
  });

  it.each([
    ["Ctrl K", { ctrlKey: true }],
    ["⌘ K", { metaKey: true }],
  ])("%s ouvre la palette partout et annule l'action du navigateur", (_l, mod) => {
    const { onOpenChange } = setup({ open: false });
    const event = new KeyboardEvent("keydown", {
      key: "k",
      bubbles: true,
      cancelable: true,
      ...mod,
    });
    const field = document.createElement("input");
    document.body.append(field);
    act(() => {
      field.dispatchEvent(event);
    });
    expect(onOpenChange).toHaveBeenCalledWith(true);
    expect(event.defaultPrevented).toBe(true);
    field.remove();
  });

  it("Échap ferme", async () => {
    const { onOpenChange } = setup();
    await user().keyboard("{Escape}");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("pied : aide clavier", () => {
    setup();
    expect(
      screen.getByText("↑ ↓ pour naviguer · ↵ pour ouvrir · Échap pour fermer"),
    ).toBeInTheDocument();
  });
});

describe("CommandPalette : recherche serveur", () => {
  it("anti-rebond de 200 ms : un seul appel avec la dernière saisie", async () => {
    const { onSearch } = setup();
    const input = screen.getByRole("combobox");
    for (const value of ["f", "fa", "fac"]) fireEvent.change(input, { target: { value } });
    expect(onSearch).not.toHaveBeenCalledWith("fac");
    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(onSearch).not.toHaveBeenCalledWith("fac");
    act(() => {
      vi.advanceTimersByTime(60);
    });
    expect(onSearch).toHaveBeenCalledWith("fac");
    expect(onSearch.mock.calls.filter(([q]) => q !== "")).toHaveLength(1);
  });

  it("aucun filtrage local : les résultats du serveur restent même si le texte ne correspond pas", async () => {
    setup();
    await user().type(screen.getByRole("combobox"), "zzzz");
    expect(screen.getByRole("option", { name: /Paiement en ligne/ })).toBeVisible();
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("CommandPalette : résultats", () => {
  it("groupes avec leur libellé, options avec type et identifiant en mono", () => {
    setup();
    for (const heading of ["Projets", "Fonctionnalités", "Tickets"]) {
      expect(screen.getByText(heading)).toBeVisible();
    }
    const option = screen.getByRole("option", { name: /Corriger la facture/ });
    expect(within(option).getByText("TK-1").className).toContain("font-mono");
    expect(screen.getAllByRole("option")).toHaveLength(3);
  });

  it("annonce le total : « 3 résultats », puis « 134 résultats · 20 affichés »", () => {
    const { rerender, ...rest } = setup();
    expect(screen.getByRole("status")).toHaveTextContent("3 résultats");
    const twenty: CommandPaletteGroup[] = [
      {
        key: "tickets",
        label: "Tickets",
        items: Array.from({ length: 20 }, (_, i) => ({
          id: `t${i}`,
          kind: `TK-${i}`,
          title: `Ticket ${i}`,
          href: `/t/${i}`,
        })),
      },
    ];
    rerender(
      <CommandPalette
        open
        status="ready"
        groups={twenty}
        total={134}
        onOpenChange={rest.onOpenChange}
        onSearch={rest.onSearch}
        onSelect={rest.onSelect}
        onRetry={rest.onRetry}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("134 résultats · 20 affichés");
  });

  it("Entrée sur l'option active la sélectionne et ferme", async () => {
    const { onSelect, onOpenChange } = setup();
    const u = user();
    await u.click(screen.getByRole("combobox"));
    await u.keyboard("{ArrowDown}{Enter}");
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0]?.[0]).toMatchObject({
      id: expect.any(String),
      href: expect.any(String),
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("invite « Tapez pour rechercher. » sans saisie et sans résultat", () => {
    setup({ status: "idle", groups: [] });
    expect(screen.getByText("Tapez pour rechercher.")).toBeVisible();
  });

  it("les pages locales restent affichées à l'invite", () => {
    setup({
      status: "idle",
      groups: [
        {
          key: "pages",
          label: "Pages",
          items: [{ id: "tickets", kind: "Page", title: "Tickets", href: "/projects/p1/tickets" }],
        },
      ],
    });
    expect(screen.getByText("Tapez pour rechercher.")).toBeVisible();
    expect(screen.getByRole("option", { name: /Tickets/ })).toBeVisible();
  });
});

describe("CommandPalette : états", () => {
  it("chargement : aria-busy, quatre squelettes, pas d'option", () => {
    setup({ status: "loading", groups: [] });
    expect(screen.getByRole("listbox")).toHaveAttribute("aria-busy", "true");
    expect(document.querySelectorAll("[data-slot='skeleton']")).toHaveLength(4);
    expect(screen.queryAllByRole("option")).toHaveLength(0);
  });

  it("vide : « Aucun résultat pour « zzz » » et la phrase sur l'ensemble du projet", async () => {
    const { rerender, ...rest } = setup({ status: "idle", groups: [] });
    await user().type(screen.getByRole("combobox"), "zzz");
    rerender(
      <CommandPalette
        open
        status="ready"
        groups={[]}
        onOpenChange={rest.onOpenChange}
        onSearch={rest.onSearch}
        onSelect={rest.onSelect}
        onRetry={rest.onRetry}
      />,
    );
    expect(screen.getByText("Aucun résultat pour « zzz »")).toBeVisible();
    expect(
      screen.getByText(
        "La recherche porte sur tout le projet, pas seulement sur ce qui est affiché.",
      ),
    ).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("Aucun résultat");
  });

  it("erreur : alerte, bouton « Réessayer » qui relance", async () => {
    const { onRetry } = setup({ status: "error", groups: [] });
    expect(screen.getByRole("alert")).toHaveTextContent("La recherche a échoué. Réessayez.");
    await user().click(screen.getByRole("button", { name: "Réessayer" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("largeur : 560 px au plus, ancrée en haut sous 640 px", () => {
    setup();
    const cls = screen.getByRole("dialog").className;
    expect(cls).toContain("sm:max-w-[560px]");
    expect(cls).toContain("bg-raised");
  });
});

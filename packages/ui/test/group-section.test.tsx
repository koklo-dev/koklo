// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { GroupSection } from "../src/index.ts";

/**
 * TK-94 lot B (passation 07 §1.4 et §5, DESIGN.md v2.1 §5.3) : `GroupSection`.
 * Groupe repliable, en-tête collant sur `--surface`, `aria-expanded`, action de groupe nommée avec son compte,
 * « Afficher N de plus · M restantes dans ce groupe ».
 */
const header = () => document.querySelector("[data-slot='group-section-header']") as HTMLElement;

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("GroupSection", () => {
  const props = {
    label: "Fonctionnalités · Réservation",
    counts: "42 · 18 acceptées · 22 à relire",
  };

  it("en-tête : libellé et compteurs dans un titre dont le niveau est réglable", () => {
    render(
      <GroupSection {...props} headingLevel={3} defaultOpen>
        <p>contenu</p>
      </GroupSection>,
    );
    const heading = screen.getByRole("heading", { level: 3 });
    expect(heading).toHaveTextContent("Fonctionnalités · Réservation");
    const meta = screen.getByText("42 · 18 acceptées · 22 à relire");
    expect(heading).not.toContainElement(meta);
    expect(meta).toHaveClass("text-caption", "font-normal");
  });

  it("en-tête de 48 : bascule de 28, écart 6, marges 4, chevron keyboard_arrow_down", () => {
    const { container } = render(
      <GroupSection {...props} defaultOpen>
        <p>contenu</p>
      </GroupSection>,
    );
    const toggle = screen.getByRole("button", { name: /Fonctionnalités/ });
    expect(toggle).toHaveClass("min-h-7", "gap-x-1.5", "px-1");
    expect(container.querySelector("[data-slot='group-section-header']")).toHaveClass("py-2.5");
    expect(toggle.querySelector("svg[data-icon='keyboard_arrow_down']")).not.toBeNull();
  });

  it("le bouton d'en-tête porte aria-expanded et aria-controls vers la région", async () => {
    render(
      <GroupSection {...props} defaultOpen>
        <p>contenu</p>
      </GroupSection>,
    );
    const toggle = screen.getByRole("button", { name: /Fonctionnalités · Réservation/ });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    const region = document.getElementById(toggle.getAttribute("aria-controls") ?? "");
    expect(region).not.toBeNull();
    expect(region).toHaveTextContent("contenu");
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(region).toHaveAttribute("hidden");
    expect(screen.queryByText("contenu")).toBeNull();
  });

  it("replié par défaut quand defaultOpen est absent ; le focus reste sur le bouton", async () => {
    render(
      <GroupSection {...props}>
        <p>contenu</p>
      </GroupSection>,
    );
    const toggle = screen.getByRole("button", { name: /Fonctionnalités/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(toggle).toHaveFocus();
  });

  it("contrôlé : open et onOpenChange", async () => {
    const onOpenChange = vi.fn();
    render(
      <GroupSection {...props} open onOpenChange={onOpenChange}>
        <p>contenu</p>
      </GroupSection>,
    );
    await userEvent.click(screen.getByRole("button", { name: /Fonctionnalités/ }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(screen.getByText("contenu")).toBeInTheDocument();
  });

  it("en-tête collant sur --surface", () => {
    render(
      <GroupSection {...props} defaultOpen>
        <p>contenu</p>
      </GroupSection>,
    );
    expect(header().className).toMatch(/\bsticky\b/);
    expect(header().className).toMatch(/bg-surface/);
    expect(header().className).toMatch(/top-0/);
  });

  it("action de groupe nommée avec son compte, hors du bouton d'en-tête", async () => {
    const onClick = vi.fn();
    render(
      <GroupSection {...props} defaultOpen action={{ label: "Accepter les 22 restantes", onClick }}>
        <p>contenu</p>
      </GroupSection>,
    );
    const action = screen.getByRole("button", { name: "Accepter les 22 restantes" });
    expect(screen.getByRole("button", { name: /Fonctionnalités/ }).contains(action)).toBe(false);
    await userEvent.click(action);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("« Afficher 20 de plus · 134 restantes dans ce groupe »", async () => {
    const onShowMore = vi.fn();
    render(
      <GroupSection
        {...props}
        defaultOpen
        remaining={134}
        showMoreCount={20}
        onShowMore={onShowMore}
      >
        <p>contenu</p>
      </GroupSection>,
    );
    const more = screen.getByRole("button", {
      name: "Afficher 20 de plus · 134 restantes dans ce groupe",
    });
    await userEvent.click(more);
    expect(onShowMore).toHaveBeenCalledTimes(1);
  });

  it("rien à afficher de plus : pas de bouton ; un seul reste : singulier", () => {
    const { rerender } = render(
      <GroupSection {...props} defaultOpen remaining={0} onShowMore={() => undefined}>
        <p>contenu</p>
      </GroupSection>,
    );
    expect(screen.queryByRole("button", { name: /Afficher/ })).toBeNull();
    rerender(
      <GroupSection
        {...props}
        defaultOpen
        remaining={1}
        showMoreCount={20}
        onShowMore={() => undefined}
      >
        <p>contenu</p>
      </GroupSection>,
    );
    expect(
      screen.getByRole("button", { name: "Afficher 1 de plus · 1 restante dans ce groupe" }),
    ).toBeVisible();
  });

  it("groupe replié : ni action de groupe ni « Afficher plus » inutiles au clavier", () => {
    render(
      <GroupSection
        {...props}
        action={{ label: "Accepter les 22 restantes", onClick: () => undefined }}
        remaining={5}
        onShowMore={() => undefined}
      >
        <p>contenu</p>
      </GroupSection>,
    );
    expect(screen.queryByRole("button", { name: /Afficher/ })).toBeNull();
  });

  it("stacked : sans cadre ni rayon propres, bordure basse", () => {
    render(
      <GroupSection {...props} variant="stacked" defaultOpen>
        <p>contenu</p>
      </GroupSection>,
    );
    const section = document.querySelector("[data-slot='group-section']") as HTMLElement;
    expect(section.className).toMatch(/border-b/);
    expect(section.className).not.toMatch(/rounded/);
    expect(section.className).not.toMatch(/\bborder\b(?!-)/);
    expect(header().className).not.toMatch(/rounded/);
    expect(header().className).not.toMatch(/border-b/);
  });

  it("par défaut (card) : cadre arrondi inchangé", () => {
    render(
      <GroupSection {...props} defaultOpen>
        <p>contenu</p>
      </GroupSection>,
    );
    const section = document.querySelector("[data-slot='group-section']") as HTMLElement;
    expect(section.className).toMatch(/rounded-xl/);
  });

  it("chevron 18, méta en text-caption", () => {
    render(
      <GroupSection {...props} defaultOpen>
        <p>contenu</p>
      </GroupSection>,
    );
    const toggle = screen.getByRole("button", { name: /Fonctionnalités/ });
    expect(toggle.querySelector("svg")).toHaveAttribute("width", "18");
    expect(screen.getByText(props.counts).className).toMatch(/text-caption/);
  });

  it("action + actionIcon : visible replié et ouvert, Button outline xs avec icône", async () => {
    const onClick = vi.fn();
    render(
      <GroupSection
        {...props}
        action={{ label: "Accepter les 22 restantes", onClick }}
        actionIcon="done_all"
      >
        <p>contenu</p>
      </GroupSection>,
    );
    const action = screen.getByRole("button", { name: "Accepter les 22 restantes" });
    expect(screen.getByRole("button", { name: /Fonctionnalités/ })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(action.className).toMatch(/\bh-7\b/);
    expect(action.className).toMatch(/border-input/);
    expect(action.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    await userEvent.click(screen.getByRole("button", { name: /Fonctionnalités/ }));
    expect(screen.getByRole("button", { name: "Accepter les 22 restantes" })).toBeVisible();
  });

  it("rangée « Afficher N de plus » : pleine largeur, h-9, text-primary, bordure haute", () => {
    render(
      <GroupSection {...props} defaultOpen remaining={134} onShowMore={() => undefined}>
        <p>contenu</p>
      </GroupSection>,
    );
    const more = screen.getByRole("button", { name: /Afficher 20 de plus/ });
    for (const cls of [/\bw-full\b/, /\bh-9\b/, /text-primary/, /border-t/]) {
      expect(more.className).toMatch(cls);
    }
  });
});

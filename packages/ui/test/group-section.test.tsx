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
    expect(heading).toHaveTextContent("42 · 18 acceptées · 22 à relire");
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
});

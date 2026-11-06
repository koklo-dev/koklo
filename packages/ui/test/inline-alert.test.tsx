// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { InlineAlert } from "../src/index.ts";

/**
 * TK-87 CA2, cas 2.6 (passation 01 §0.3, DESIGN.md v2 §5.1, 02-design §2.3) : 3 variantes et leurs rôles,
 * icône 18 px, une action facultative, « Détails » contrôlé (aria-expanded, aria-controls), 40 px au moins.
 */
const VARIANTS = [
  ["neutral", "note", "lock"],
  ["warning", "status", "schedule"],
  ["error", "alert", "error"],
] as const;

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("InlineAlert", () => {
  it.each(VARIANTS)("%s : role=%s, icône 18 px décorative, texte", (variant, role, icon) => {
    render(
      <InlineAlert variant={variant} icon={icon}>
        Message de test
      </InlineAlert>,
    );
    const alert = screen.getByRole(role);
    expect(alert).toHaveTextContent("Message de test");
    expect(alert).toHaveAttribute("data-slot", "inline-alert");
    expect(alert).toHaveAttribute("data-variant", variant);
    const svg = alert.querySelector("svg");
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg).toHaveAttribute("width", "18");
  });

  it.each(VARIANTS)("%s : couleurs d'alerte du jeton, jamais la marque", (variant, role, icon) => {
    render(
      <InlineAlert variant={variant} icon={icon}>
        x
      </InlineAlert>,
    );
    const cls = screen.getByRole(role).className;
    expect(cls).toMatch(new RegExp(`alert-${variant}`));
    expect(cls).not.toMatch(/primary|violet|purple/);
  });

  it("hauteur minimale de 40 px", () => {
    render(
      <InlineAlert variant="neutral" icon="lock">
        x
      </InlineAlert>,
    );
    expect(screen.getByRole("note").className).toMatch(/\bmin-h-(?:10|\[40px\])\b/);
  });

  it("sans action : aucun bouton", () => {
    render(
      <InlineAlert variant="neutral" icon="lock">
        x
      </InlineAlert>,
    );
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("action : un bouton texte nommé, qui appelle onClick", async () => {
    const onClick = vi.fn();
    render(
      <InlineAlert variant="warning" icon="schedule" action={{ label: "Annuler", onClick }}>
        Trop de demandes. Nouvel essai possible dans 28 s.
      </InlineAlert>,
    );
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(1);
    await userEvent.click(screen.getByRole("button", { name: "Annuler" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("« Détails » : replié par défaut, aria-expanded=false, aria-controls vers une zone absente ou masquée", () => {
    render(
      <InlineAlert variant="neutral" icon="lock" details={<p>Le détail complet.</p>}>
        Votre texte est envoyé à l'agent IA avec la clé de l'organisation.
      </InlineAlert>,
    );
    const toggle = screen.getByRole("button", { name: "Détails" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    const controls = toggle.getAttribute("aria-controls");
    expect(controls).toBeTruthy();
    expect(screen.queryByText("Le détail complet.")).not.toBeInTheDocument();
  });

  it("« Détails » : le clic déplie la zone contrôlée, le libellé ne change pas, le focus reste", async () => {
    render(
      <InlineAlert variant="neutral" icon="lock" details={<p>Le détail complet.</p>}>
        Ligne
      </InlineAlert>,
    );
    const toggle = screen.getByRole("button", { name: "Détails" });
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    const region = document.getElementById(toggle.getAttribute("aria-controls") ?? "");
    expect(region).not.toBeNull();
    expect(region).toHaveTextContent("Le détail complet.");
    expect(region).toBeVisible();
    expect(toggle).toHaveAccessibleName("Détails");
    expect(toggle).toHaveFocus();
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Le détail complet.")).not.toBeInTheDocument();
  });

  it("« Détails » au clavier : Entrée puis Espace", async () => {
    render(
      <InlineAlert variant="neutral" icon="lock" details={<p>Détail</p>}>
        Ligne
      </InlineAlert>,
    );
    await userEvent.tab();
    const toggle = screen.getByRole("button", { name: "Détails" });
    expect(toggle).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    await userEvent.keyboard(" ");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  it("detailsLabel et defaultOpen", () => {
    render(
      <InlineAlert
        variant="neutral"
        icon="lock"
        details={<p>Détail</p>}
        detailsLabel="En savoir plus"
        defaultOpen
      >
        Ligne
      </InlineAlert>,
    );
    expect(screen.getByRole("button", { name: "En savoir plus" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(screen.getByText("Détail")).toBeVisible();
  });

  it("deux alertes à détail ont des zones d'id distincts", () => {
    render(
      <>
        <InlineAlert variant="neutral" icon="lock" details={<p>A</p>}>
          a
        </InlineAlert>
        <InlineAlert variant="neutral" icon="lock" details={<p>B</p>}>
          b
        </InlineAlert>
      </>,
    );
    const ids = screen
      .getAllByRole("button", { name: "Détails" })
      .map((b) => b.getAttribute("aria-controls"));
    expect(new Set(ids).size).toBe(2);
  });

  it("refuse au type une action et un détail ensemble", () => {
    render(
      // @ts-expect-error action ou details, jamais les deux
      <InlineAlert
        variant="neutral"
        icon="lock"
        action={{ label: "A", onClick: () => undefined }}
        details={<p>D</p>}
      >
        x
      </InlineAlert>,
    );
  });
});

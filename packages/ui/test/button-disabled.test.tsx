// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Button, buttonVariants } from "../src/index.ts";

/**
 * TK-87 CA2, cas 2.9 (passation 01 §0.3, DESIGN.md v2 §5.2, 02-design §2.3, questions.md B26) :
 * plus d'opacité réduite ; pointillé --border-strong, fond --surface, texte --muted-foreground pour toutes
 * les variantes ; raison visible reliée par aria-describedby.
 */
const VARIANTS = ["default", "secondary", "outline", "ghost", "destructive"] as const;
const DISABLED = [
  "disabled:border",
  "disabled:border-dashed",
  "disabled:border-border-strong",
  "disabled:bg-surface",
  "disabled:text-muted-foreground",
];

describe("Button désactivé", () => {
  it.each(VARIANTS)("%s : plus d'opacity-50, style pointillé du jeton", (variant) => {
    const cls = buttonVariants({ variant });
    expect(cls).not.toMatch(/opacity-50/);
    for (const c of DISABLED) expect(cls.split(/\s+/), `${variant} ${c}`).toContain(c);
  });

  it.each(VARIANTS)("%s rendu désactivé : classes appliquées au bouton", (variant) => {
    render(
      <Button variant={variant} disabled>
        Désactivé
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Désactivé" });
    expect(button).toBeDisabled();
    expect(button.className).not.toMatch(/opacity-50/);
    expect(button).toHaveClass("disabled:border-dashed", "disabled:bg-surface");
  });

  it("raison visible reliée par aria-describedby (désactivé durable)", () => {
    render(
      <Button disabled disabledReason="Toujours avec sa raison à côté">
        Désactivé
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Désactivé" });
    const reason = screen.getByText("Toujours avec sa raison à côté");
    expect(reason).toBeVisible();
    expect(reason.id).not.toBe("");
    expect(button.getAttribute("aria-describedby")?.split(/\s+/)).toContain(reason.id);
    expect(button).toHaveAccessibleDescription("Toujours avec sa raison à côté");
    expect(reason).toHaveClass("text-muted-foreground");
  });

  it("raison ignorée tant que le bouton est actif", () => {
    render(<Button disabledReason="Raison">Actif</Button>);
    expect(screen.queryByText("Raison")).toBeNull();
    expect(screen.getByRole("button", { name: "Actif" })).not.toHaveAttribute("aria-describedby");
  });

  it("désactivé transitoire : aucune raison, aria-busy conservé", () => {
    render(
      <Button disabled aria-busy="true">
        Enregistrement…
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Enregistrement…" });
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button).not.toHaveAttribute("aria-describedby");
  });

  it("deux raisons ont des id distincts", () => {
    render(
      <>
        <Button disabled disabledReason="A">
          Un
        </Button>
        <Button disabled disabledReason="B">
          Deux
        </Button>
      </>,
    );
    expect(screen.getByText("A").id).not.toBe(screen.getByText("B").id);
  });

  it("refuse au type disabledReason avec asChild", () => {
    render(
      // @ts-expect-error disabledReason interdit avec asChild
      <Button asChild disabledReason="x">
        <a href="#x">Lien</a>
      </Button>,
    );
  });
});

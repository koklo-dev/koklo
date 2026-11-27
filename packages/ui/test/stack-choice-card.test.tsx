// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { StackChoiceCard, StackFicheTitle, StackLayer } from "../src/index.ts";

/** TK-115 lot C : couche et carte d'un choix technique (DESIGN.md §5.26, maquette 14 l.179-187, 567-571). */
function card(props: Partial<Parameters<typeof StackChoiceCard>[0]> = {}) {
  return render(
    <StackChoiceCard
      id="ST-api"
      roleName="API"
      choice="Node.js 22 · oRPC"
      forText="Pour C-api"
      status="chosen"
      icon="hub"
      onSelect={() => undefined}
      {...props}
    />,
  );
}

const button = () => screen.getByRole("button");

describe("StackLayer", () => {
  it("titre de niveau 2 en capitales avec le compte, grille de 2 colonnes dès 768 px", () => {
    render(
      <StackLayer label="Services et API" count={3}>
        <span>carte</span>
      </StackLayer>,
    );
    const heading = screen.getByRole("heading", { level: 2, name: "Services et API 3" });
    expect(heading.className).toContain("uppercase");
    expect(heading.className).toContain("text-muted-foreground");
    expect(screen.getByRole("region", { name: "Services et API 3" })).toBeInTheDocument();
    const grid = screen.getByText("carte").parentElement as HTMLElement;
    expect(grid.className).toContain("grid-cols-1");
    expect(grid.className).toContain("md:grid-cols-2");
    expect(grid.className).toContain("gap-2.5");
  });
});

describe("StackChoiceCard", () => {
  it("bouton non pressé : rôle, choix, usage, statut « Choisi » et identifiant dans son nom", async () => {
    const onSelect = vi.fn();
    card({ onSelect });
    expect(button()).toHaveAttribute("type", "button");
    expect(button()).toHaveAttribute("aria-pressed", "false");
    for (const text of ["API", "Node.js 22 · oRPC", "Pour C-api", "Choisi", "ST-api"]) {
      expect(button()).toHaveTextContent(text);
    }
    expect(button().className).toContain("rounded-xl");
    expect(button().className).toContain("border-border");
    expect(screen.getByText("Choisi")).toHaveAttribute("data-tone", "success");
    await userEvent.click(button());
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("choisie : pressée, contour 2 px primaire, tuile primaire", () => {
    card({ selected: true });
    expect(button()).toHaveAttribute("aria-pressed", "true");
    expect(button().className).toContain("border-2");
    expect(button().className).toContain("border-primary");
    expect(button().className).toContain("shadow-floating");
    expect(button().querySelector("[data-slot='icon-tile']")).toHaveAttribute(
      "data-tone",
      "primary",
    );
  });

  it("à trancher : pastille d'avertissement, tuile douce", () => {
    card({ status: "open", choice: "À trancher" });
    const pill = button().querySelector("[data-slot='pill']") as HTMLElement;
    expect(pill).toHaveTextContent("À trancher");
    expect(pill).toHaveAttribute("data-tone", "warning");
    expect(button().querySelector("[data-slot='icon-tile']")).toHaveAttribute("data-tone", "soft");
  });

  it("à revoir : contour ambre de 2 px et « à revoir » dans le nom", () => {
    card({ stale: true });
    expect(screen.getByRole("button", { name: /à revoir/ })).toBe(button());
    expect(button().className).toContain("border-status-pending-icon");
    expect(button().className).toContain("border-2");
  });

  it("proposée par l'agent : contour pointillé", () => {
    card({ proposed: true });
    expect(button().className).toContain("border-dashed");
    expect(button().className).toContain("border-border-strong");
  });
});

describe("StackChoiceCard : identifiant", () => {
  it("mono 11, sans graisse (maquette 14 l.186)", () => {
    card();
    const id = screen.getByText("ST-api");
    expect(id.className).toContain("font-mono");
    expect(id.className).toContain("font-normal");
  });
});

describe("StackFicheTitle", () => {
  it("titre de niveau 2 en 22/600 (maquette 14 l.190)", () => {
    render(<StackFicheTitle>PostgreSQL 17</StackFicheTitle>);
    const title = screen.getByRole("heading", { level: 2, name: "PostgreSQL 17" });
    expect(title.className).toContain("text-[22px]");
    expect(title.className).toContain("font-semibold");
  });
});

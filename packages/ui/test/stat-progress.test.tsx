// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProgressBar, StatCard } from "../src/index.ts";

/** TK-139 lot A, cas 3 et 4 (fiche §3, DESIGN.md §5.6) : `StatCard` et `ProgressBar`. */
describe("ProgressBar", () => {
  it("role progressbar, valeurs, nom accessible", () => {
    render(<ProgressBar value={40} aria-label="Avancement du dossier" />);
    const bar = screen.getByRole("progressbar", { name: "Avancement du dossier" });
    expect(bar).toHaveAttribute("aria-valuenow", "40");
    expect(bar).toHaveAttribute("aria-valuemin", "0");
    expect(bar).toHaveAttribute("aria-valuemax", "100");
  });

  it("piste --border-strong, remplissage --primary, largeur = valeur", () => {
    render(<ProgressBar value={40} aria-label="x" />);
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveClass("bg-border-strong");
    const fill = bar.firstElementChild as HTMLElement;
    expect(fill).toHaveClass("bg-primary");
    expect(fill.style.width).toBe("40%");
  });

  it.each([
    ["md", "h-1.5", "rounded-[3px]"],
    ["lg", "h-2", "rounded-[4px]"],
  ] as const)("taille %s : %s et %s", (size, height, radius) => {
    render(<ProgressBar value={10} size={size} aria-label="x" />);
    expect(screen.getByRole("progressbar")).toHaveClass(height, radius);
  });

  it("md par défaut", () => {
    render(<ProgressBar value={10} aria-label="x" />);
    expect(screen.getByRole("progressbar")).toHaveClass("h-1.5");
  });

  it.each([
    [-20, "0"],
    [250, "100"],
    [0, "0"],
    [100, "100"],
  ])("valeur %s bornée à %s", (value, expected) => {
    render(<ProgressBar value={value} aria-label="x" />);
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", expected);
    expect((bar.firstElementChild as HTMLElement).style.width).toBe(`${expected}%`);
  });

  it("refuse au type une barre sans nom", () => {
    // @ts-expect-error nom accessible obligatoire
    render(<ProgressBar value={1} />);
  });
});

describe("StatCard", () => {
  it("libellé, icône décorative, valeur text-stat, note", () => {
    const { container } = render(
      <StatCard label="Projets actifs" icon="folder_open" value="12" note="dont 3 en cadrage" />,
    );
    const root = container.firstElementChild;
    expect(root).toHaveAttribute("data-slot", "stat-card");
    expect(root).toHaveClass("rounded-xl", "bg-background");
    expect(screen.getByText("Projets actifs")).toHaveClass("text-meta", "text-muted-foreground");
    const svg = root?.querySelector("svg");
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg).toHaveAttribute("width", "18");
    expect(screen.getByText("12")).toHaveClass("text-stat");
    expect(screen.getByText("dont 3 en cadrage")).toHaveClass(
      "text-caption",
      "text-muted-foreground",
    );
  });

  it("sans icône ni note ni jauge", () => {
    const { container } = render(<StatCard label="Membres" value="5" />);
    expect(container.querySelector("svg")).toBeNull();
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("jauge facultative : ProgressBar nommée", () => {
    render(
      <StatCard
        label="Consommation"
        value="38 %"
        gauge={{ value: 38, label: "Part du plafond mensuel consommée" }}
      />,
    );
    const bar = screen.getByRole("progressbar", { name: "Part du plafond mensuel consommée" });
    expect(bar).toHaveAttribute("aria-valuenow", "38");
  });
});

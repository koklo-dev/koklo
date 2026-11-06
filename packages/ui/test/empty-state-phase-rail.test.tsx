// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Button, EmptyState, PhaseRail } from "../src/index.ts";

/** TK-87 CA2, cas 2.7 et 2.8 (passation 01 §0.3, DESIGN.md v2 §5.1, 02-design §2.3). */

describe("EmptyState", () => {
  const props = {
    icon: "lightbulb",
    title: "Aucune idée encore",
    description: "Racontez le projet en quelques phrases, l'agent vous aide à le structurer.",
  } as const;

  it("titre, une phrase, tuile d'icône décorative, cadre pointillé sur --surface", () => {
    const { container } = render(<EmptyState {...props} />);
    const root = container.querySelector("[data-slot='empty-state']");
    expect(root).not.toBeNull();
    expect(root).toHaveClass("border-dashed", "border-border-strong", "bg-surface");
    expect(screen.getByText(props.title)).toBeVisible();
    expect(screen.getByText(props.description)).toBeVisible();
    const svg = root?.querySelector("svg");
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg).toHaveAttribute("width", "28");
  });

  it("le titre n'est pas un titre de section (il ne casse pas le plan)", () => {
    render(<EmptyState {...props} />);
    expect(screen.queryByRole("heading")).toBeNull();
    expect(screen.getByText(props.title).tagName).toBe("P");
  });

  it("une seule action principale, rendue telle quelle", () => {
    render(<EmptyState {...props} action={<Button>Commencer le dossier</Button>} />);
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Commencer le dossier" })).toBeVisible();
  });

  it("sans action : aucun bouton", () => {
    render(<EmptyState {...props} />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("refuse au type une liste d'actions", () => {
    render(
      // @ts-expect-error une seule action : le type ne prend pas de tableau
      <EmptyState {...props} action={[<Button key="a">A</Button>, <Button key="b">B</Button>]} />,
    );
  });
});

const STEPS = ["Idée", "Cadrage", "Baseline 0", "Itérations"] as const;
const PHASES = ["idea", "framing", "baseline", "iterations"] as const;

describe("PhaseRail grand", () => {
  it("liste ordonnée nommée « Phase du projet », 4 étapes dans l'ordre", () => {
    render(<PhaseRail phase="framing" />);
    const list = screen.getByRole("list", { name: "Phase du projet" });
    expect(list.tagName).toBe("OL");
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(4);
    items.forEach((item, i) => {
      expect(item).toHaveTextContent(STEPS[i] as string);
    });
  });

  it.each(PHASES.map((p, i) => [p, i] as const))(
    "phase %s : états portés par le texte, aria-current=step sur l'étape en cours",
    (phase, current) => {
      render(<PhaseRail phase={phase} />);
      const items = within(screen.getByRole("list", { name: "Phase du projet" })).getAllByRole(
        "listitem",
      );
      items.forEach((item, i) => {
        const state = i < current ? "terminée" : i === current ? "en cours" : "à venir";
        expect(item, `${STEPS[i]} ${state}`).toHaveTextContent(state);
        if (i === current) expect(item).toHaveAttribute("aria-current", "step");
        else expect(item).not.toHaveAttribute("aria-current");
      });
    },
  );

  it("sous-titres facultatifs rendus sous l'étape", () => {
    render(
      <PhaseRail
        phase="framing"
        subtitles={{
          idea: "Dossier stable, 8 pages sur 10",
          framing: "4 fonctionnalités sur 7 validées",
        }}
      />,
    );
    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Dossier stable, 8 pages sur 10");
    expect(items[1]).toHaveTextContent("4 fonctionnalités sur 7 validées");
  });

  it("icônes d'étape décoratives (18 px)", () => {
    render(<PhaseRail phase="framing" />);
    for (const svg of screen.getByRole("list").querySelectorAll("svg")) {
      expect(svg).toHaveAttribute("aria-hidden", "true");
      expect(svg).toHaveAttribute("width", "18");
    }
  });
});

describe("PhaseRail miniature (size=sm)", () => {
  it.each([
    ["idea", "Idée · 1 sur 4"],
    ["framing", "Cadrage · 2 sur 4"],
    ["baseline", "Baseline 0 · 3 sur 4"],
    ["iterations", "Itérations · 4 sur 4"],
  ] as const)("%s : « %s », précédé de « Phase : » lu seulement", (phase, text) => {
    const { container } = render(<PhaseRail phase={phase} size="sm" />);
    const root = container.querySelector("[data-slot='phase-rail']");
    expect(root).toHaveTextContent(text);
    expect(screen.getByText(/^Phase\s?:/)).toHaveClass("sr-only");
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("4 traits décoratifs", () => {
    const { container } = render(<PhaseRail phase="framing" size="sm" />);
    const track = container.querySelector("[data-slot='phase-rail'] [aria-hidden='true']");
    expect(track).not.toBeNull();
    expect(track?.children).toHaveLength(4);
  });
});

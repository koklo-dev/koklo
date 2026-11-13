// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Button, EmptyState, PhaseRail } from "../src/index.ts";

/** TK-87 CA2, cas 2.7 et 2.8 (passation 01 §0.3, DESIGN.md v2 §5.1, 02-design §2.3). */

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
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

  it("TK-139 et TK-107 : écart 12, tuile IconTile 48 décorative", () => {
    const { container } = render(<EmptyState {...props} />);
    const root = container.querySelector("[data-slot='empty-state']");
    expect(root).toHaveClass("gap-3");
    expect(root).toHaveAttribute("data-variant", "framed");
    const tile = root?.querySelector("[data-slot='icon-tile']");
    expect(tile).toHaveAttribute("data-size", "48");
    expect(tile).toHaveAttribute("aria-hidden", "true");
  });

  it("TK-141 : inline bordered porte le cadre plein de la liste (rayon 12, pas de pointillés)", () => {
    const { container } = render(<EmptyState {...props} variant="inline" bordered />);
    const root = container.querySelector("[data-slot='empty-state']");
    expect(root).toHaveClass("rounded-xl", "border", "border-border", "bg-background");
    expect(root).not.toHaveClass("border-dashed");
  });

  it("TK-139 : inline sans cadre ni tuile", () => {
    const { container } = render(<EmptyState {...props} variant="inline" />);
    const root = container.querySelector("[data-slot='empty-state']");
    expect(root).toHaveAttribute("data-variant", "inline");
    expect(root).not.toHaveClass("border", "border-dashed", "bg-surface", "rounded-xl");
    expect(root?.querySelector("[data-slot='icon-tile']")).toBeNull();
    const icon = root?.querySelector("svg");
    expect(icon).toHaveAttribute("width", "28");
    expect(icon).toHaveClass("text-muted-foreground");
    expect(screen.getByText(props.title)).toBeVisible();
  });

  it("TK-139 : une action principale et au plus une secondaire", () => {
    render(
      <EmptyState
        {...props}
        action={<Button>Commencer le dossier</Button>}
        secondaryAction={<Button variant="outline">Importer</Button>}
      />,
    );
    expect(screen.getAllByRole("button")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Importer" })).toBeVisible();
  });

  it("TK-139 : refuse au type une liste d'actions secondaires", () => {
    render(
      // @ts-expect-error une seule action secondaire
      <EmptyState {...props} secondaryAction={[<Button key="a">A</Button>]} />,
    );
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

const CustomLink = ({ href, children, ...rest }: React.ComponentProps<"a"> & { href: string }) => (
  <a href={href} data-custom="oui" {...rest}>
    {children}
  </a>
);

describe("PhaseRail navigable", () => {
  const hrefs = { idea: "/p/idea", framing: "/p/framing" } as const;

  it("une étape avec adresse devient un lien nommé par son libellé et son état", () => {
    render(<PhaseRail phase="framing" hrefs={hrefs} />);
    expect(screen.getByRole("link", { name: "Idée terminée" })).toHaveAttribute("href", "/p/idea");
    expect(screen.getByRole("link", { name: "Cadrage en cours" })).toHaveAttribute(
      "href",
      "/p/framing",
    );
  });

  it("une étape sans adresse reste du texte, sans lien", () => {
    render(<PhaseRail phase="framing" hrefs={hrefs} />);
    expect(screen.getAllByRole("link")).toHaveLength(2);
    expect(screen.getByText("Baseline 0")).toBeVisible();
  });

  it("sans adresses : aucun lien (affichage seul)", () => {
    render(<PhaseRail phase="framing" />);
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("l'étape en cours garde aria-current=step et le lien est dans l'élément de liste", () => {
    render(<PhaseRail phase="framing" hrefs={hrefs} />);
    const link = screen.getByRole("link", { name: "Cadrage en cours" });
    expect(link.closest("li")).toHaveAttribute("aria-current", "step");
  });

  it("utilise LinkComponent quand il est fourni", () => {
    render(<PhaseRail phase="idea" hrefs={{ idea: "/x" }} LinkComponent={CustomLink} />);
    expect(screen.getByRole("link", { name: "Idée en cours" })).toHaveAttribute(
      "data-custom",
      "oui",
    );
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

describe("PhaseRail inline (size=inline)", () => {
  it("span sans bordure ni padding, 12 muted, 4 traits w-3 h-1", () => {
    const { container } = render(<PhaseRail phase="framing" size="inline" />);
    const root = container.querySelector("[data-slot='phase-rail']") as HTMLElement;
    expect(root.tagName).toBe("SPAN");
    expect(root).toHaveClass("text-caption", "text-muted-foreground");
    expect(root).not.toHaveClass("border");
    expect(root.className).not.toMatch(/\bpx-|\bp-|\bh-7\b/);
    const bars = root.querySelector("[aria-hidden='true']")?.children;
    expect(bars).toHaveLength(4);
    for (const bar of Array.from(bars ?? [])) expect(bar).toHaveClass("w-3", "h-1");
  });

  it("texte « Cadrage · 2 sur 4 » précédé de « Phase : » lu seulement", () => {
    const { container } = render(<PhaseRail phase="framing" size="inline" />);
    expect(container.querySelector("[data-slot='phase-rail']")).toHaveTextContent(
      "Cadrage · 2 sur 4",
    );
    expect(screen.getByText(/^Phase\s?:/)).toHaveClass("sr-only");
  });

  it("`sm` garde w-3.5 et son cadre", () => {
    const { container } = render(<PhaseRail phase="framing" size="sm" />);
    const root = container.querySelector("[data-slot='phase-rail']");
    expect(root).toHaveClass("border");
    expect(root?.querySelector("[aria-hidden='true']")?.children[0]).toHaveClass("w-3.5");
  });
});

describe("PhaseRail inline : texte 12/400 (05 l.51)", () => {
  it("text-caption font-normal", () => {
    const { container } = render(<PhaseRail phase="framing" size="inline" />);
    expect(container.querySelector("[data-slot='phase-rail']")).toHaveClass("font-normal");
  });
});

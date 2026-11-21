// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ARCH_NODE_LABELS, ArchNodeCard, type ArchNodeKind, archNodeSize } from "../src/index.ts";

/** TK-112 lot B : nœud du schéma d'architecture (DESIGN.md §5.23, maquette 13 l.576-583, 683-690). */
const KINDS: ArchNodeKind[] = ["actor", "app", "service", "store", "queue", "ext"];
const root = () => document.querySelector("[data-slot='arch-node']") as HTMLElement;

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("ArchNodeCard", () => {
  it.each([
    ["actor", 160, 52, "rounded-full"],
    ["app", 220, 70, "rounded-[10px]"],
    ["service", 200, 70, "rounded-[10px]"],
    ["store", 170, 64, "rounded-[14px]"],
    ["queue", 170, 64, "rounded-[14px]"],
    ["ext", 170, 64, "rounded-[10px]"],
  ] as const)("%s : %i x %i, forme %s", (kind, width, height, shape) => {
    render(<ArchNodeCard kind={kind} name="X" />);
    expect(archNodeSize(kind)).toEqual({ width, height });
    expect(root().style.width).toBe(`${width}px`);
    expect(root().style.height).toBe(`${height}px`);
    expect(root().className).toContain(shape);
  });

  it("écrit le type en texte (jamais la forme seule) et le nomme dans le bouton", () => {
    render(<ArchNodeCard kind="queue" name="File des rappels" />);
    expect(screen.getByText(ARCH_NODE_LABELS.queue)).toBeVisible();
    expect(screen.getByRole("button", { name: "File de tâches File des rappels" })).toBeVisible();
  });

  it("l'acteur n'écrit pas de sous-titre, les autres types oui", () => {
    for (const kind of KINDS) {
      const { unmount } = render(<ArchNodeCard kind={kind} name="Nom" />);
      expect(screen.queryByText(ARCH_NODE_LABELS[kind])).toBe(
        kind === "actor" ? null : screen.getByText(ARCH_NODE_LABELS[kind]),
      );
      unmount();
    }
  });

  it("l'externe est en pointillé --border-strong sur --surface", () => {
    render(<ArchNodeCard kind="ext" name="SMS" />);
    expect(root().className).toContain("border-dashed");
    expect(root().className).toContain("border-border-strong");
    expect(root().className).toContain("bg-surface");
  });

  it("button aria-pressed : sélection en --primary, clic et clavier", async () => {
    const onSelect = vi.fn();
    render(<ArchNodeCard kind="service" name="API" selected onSelect={onSelect} />);
    const button = screen.getByRole("button", { name: "Service API" });
    expect(button).toHaveAttribute("aria-pressed", "true");
    expect(root().className).toContain("border-primary");
    expect(root().querySelector("[data-slot='arch-tile']")?.className).toContain("bg-primary");
    await userEvent.click(button);
    button.focus();
    await userEvent.keyboard("{Enter}");
    expect(onSelect).toHaveBeenCalledTimes(2);
  });

  it("nœud d'une autre zone : estompé, rond sans aria-pressed, nom « autre zone »", () => {
    render(<ArchNodeCard kind="service" name="API" ghost />);
    const button = screen.getByRole("button", { name: "Service API, autre zone" });
    expect(button).not.toHaveAttribute("aria-pressed");
    expect(root().className).toContain("opacity-70");
    expect(root().className).toContain("border-dashed");
  });

  it("proposition à relire : pointillés doublés d'un texte", () => {
    render(<ArchNodeCard kind="app" name="Portail" pending />);
    expect(screen.getByRole("button", { name: "Application Portail, à relire" })).toBeVisible();
    expect(root().className).toContain("border-dashed");
  });

  it("zoom sous 60 % : seul le nom reste, la hauteur passe à 44", () => {
    render(<ArchNodeCard kind="service" name="API" compact />);
    expect(screen.queryByText("Service")).toBeNull();
    expect(root().style.height).toBe("44px");
    expect(screen.getByRole("button", { name: "Service API" })).toBeVisible();
  });
});

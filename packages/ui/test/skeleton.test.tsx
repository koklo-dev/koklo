// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Skeleton, SkeletonRow } from "../src/index.ts";

/** TK-139 lot A, cas 7 (fiche §3, DESIGN.md §5.6) : `Skeleton` et `SkeletonRow`. */
describe("Skeleton", () => {
  it("bloc qui pulse seulement sous motion-safe", () => {
    const { container } = render(<Skeleton className="h-4 w-20" />);
    expect(container.firstElementChild).toHaveClass("motion-safe:animate-pulse", "h-4");
  });
});

describe("SkeletonRow", () => {
  it("hauteur 52, aria-hidden, pulse sous motion-safe", () => {
    const { container } = render(<SkeletonRow />);
    const row = container.firstElementChild as HTMLElement;
    expect(row).toHaveAttribute("data-slot", "skeleton-row");
    expect(row).toHaveAttribute("aria-hidden", "true");
    expect(row).toHaveClass("h-[52px]");
    expect(row.querySelector(".motion-safe\\:animate-pulse")).not.toBeNull();
    expect(row.className).not.toMatch(/(^|\s)animate-pulse/);
  });

  it("pavé 48 x 18 en --surface puis barre de 14", () => {
    const { container } = render(<SkeletonRow />);
    const [tile, bar] = Array.from(container.querySelectorAll("[data-slot='skeleton']"));
    expect(tile).toHaveClass("h-[18px]", "w-12", "bg-surface");
    expect(bar).toHaveClass("h-3.5", "bg-surface");
  });

  it.each([
    [0, "60%"],
    [1, "45%"],
    [2, "70%"],
    [3, "52%"],
    [4, "60%"],
  ])("ligne %s : barre à %s", (index, width) => {
    const { container } = render(<SkeletonRow index={index} />);
    const bar = container.querySelectorAll("[data-slot='skeleton']")[1] as HTMLElement;
    expect(bar.style.width).toBe(width);
  });
});

import { describe, expect, it } from "vitest";
import { cn } from "../src/index.ts";

describe("cn", () => {
  it("assemble des classes et ignore les valeurs falsy", () => {
    expect(cn("px-2", false, null, undefined, "text-sm")).toBe("px-2 text-sm");
  });

  it("accepte les objets et tableaux (clsx)", () => {
    expect(cn(["a", { b: true, c: false }])).toBe("a b");
  });

  it("résout les conflits Tailwind, la dernière classe gagne (tailwind-merge)", () => {
    expect(cn("px-2 py-1", "px-4")).toBe("py-1 px-4");
    expect(cn("bg-primary", "bg-secondary")).toBe("bg-secondary");
  });

  it("sans argument renvoie une chaîne vide", () => {
    expect(cn()).toBe("");
  });
});

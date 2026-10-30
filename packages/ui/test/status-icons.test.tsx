// @vitest-environment jsdom
import { render, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ICON_NAMES } from "../scripts/generate-icons.ts";
import { Icon, type IconName } from "../src/index.ts";

/** TK-35 : icônes de statut des colonnes du kanban (DESIGN S-kanban §3). */
const STATUS_ICONS = ["inbox", "radio_button_unchecked", "play_circle", "block", "cancel"] as const;

describe("icônes de statut du kanban", () => {
  it.each(STATUS_ICONS)("%s figure au registre fermé du générateur", (name) => {
    expect(ICON_NAMES).toContain(name);
  });

  // Material Symbols n'a pas de variante pleine pour l'anneau `radio_button_unchecked` : les deux tracés sont
  // identiques par conception (correction du test en Green, voir 04-green.md).
  const HAS_FILLED_VARIANT = STATUS_ICONS.filter((name) => name !== "radio_button_unchecked");

  it("radio_button_unchecked se rend (anneau identique en contour et en plein)", async () => {
    const outline = render(<Icon name="radio_button_unchecked" />);
    await waitFor(() =>
      expect(outline.container.querySelector("path")?.getAttribute("d")).toBeTruthy(),
    );
  });

  it.each(HAS_FILLED_VARIANT)(
    "%s se rend en contour et en plein avec deux tracés différents",
    async (name) => {
      const outline = render(<Icon name={name as IconName} />);
      const filled = render(<Icon name={name as IconName} fill />);
      const d = (c: HTMLElement) => c.querySelector("path")?.getAttribute("d") ?? "";
      await waitFor(() => {
        expect(d(outline.container)).not.toBe("");
        expect(d(filled.container)).not.toBe("");
      });
      expect(d(filled.container)).not.toBe(d(outline.container));
    },
  );
});

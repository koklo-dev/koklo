// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { DevUiNav } from "../src/components/dev-ui-nav.tsx";
import { polyfillRadix } from "./support/web-mocks.ts";

/** TK-140 lot C : section « Navigation · C » de la galerie /dev/ui (fiche S-dev-ui). */
beforeEach(() => polyfillRadix());

describe("galerie /dev/ui : section Navigation · C", () => {
  it("région nommée, groupes de barre, compteur et navigation secondaire", () => {
    render(<DevUiNav />);
    const region = screen.getByRole("region", { name: "Navigation · C" });
    expect(within(region).getAllByRole("group", { name: "Projet" }).length).toBeGreaterThan(0);
    expect(within(region).getByRole("link", { name: "Tickets, 12" })).toBeVisible();
    expect(within(region).getByRole("link", { name: /^Tickets\s?12$/ })).toBeVisible();
    const secondary = within(region).getByRole("navigation", { name: "Sections des réglages" });
    expect(within(secondary).getByRole("link", { current: "page" })).toBeVisible();
  });
});

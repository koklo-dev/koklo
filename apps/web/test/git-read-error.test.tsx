import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { GitReadError } from "../src/components/git-read-error.tsx";
import { RATE_LIMITED, RATE_LIMITED_TEXT } from "./support/git-read.ts";

/** TK-114f lot B : erreur de lecture Git, quota épuisé (InlineAlert + « Réessayer ») ou message habituel. */
describe("GitReadError", () => {
  it("quota épuisé : alerte d'erreur, icône d'attente, délai et « Réessayer » qui relance", async () => {
    const onRetry = vi.fn();
    render(
      <GitReadError error={RATE_LIMITED} onRetry={onRetry} retrying={false} fallback="Autre" />,
    );
    const alert = screen.getByRole("alert");
    expect(alert).toHaveAttribute("data-variant", "error");
    expect(alert).toHaveTextContent(RATE_LIMITED_TEXT);
    expect(alert.querySelector('[data-icon="schedule"]')).not.toBeNull();
    expect(screen.queryByText("Autre")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("relance en cours : « Réessayer » reste à sa place, désactivé", () => {
    render(<GitReadError error={RATE_LIMITED} onRetry={vi.fn()} retrying fallback="Autre" />);
    expect(screen.getByRole("button", { name: "Réessayer" })).toBeDisabled();
  });

  it("autre erreur : le message habituel, sans alerte ni bouton", () => {
    render(
      <GitReadError
        error={new Error("boom")}
        onRetry={vi.fn()}
        retrying={false}
        fallback="Le fichier du flux n'a pas pu être lu."
      />,
    );
    expect(screen.getByText("Le fichier du flux n'a pas pu être lu.")).toHaveClass(
      "text-destructive",
    );
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });
});

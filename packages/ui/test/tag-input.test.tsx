// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { TagInput } from "../src/index.ts";

/** TK-101 lot B, cas 1 : `TagInput` (maquette 16 l.89). */

function Tags({ onQuery = vi.fn() }: { onQuery?: (q: string) => void }) {
  const [value, setValue] = useState(["R-001"]);
  return (
    <TagInput
      label="Liens"
      value={value}
      onChange={setValue}
      suggestions={[
        { id: "F-003", title: "Réserver en ligne" },
        { id: "F-004", title: "Annuler" },
      ]}
      onQueryChange={onQuery}
      placeholder="Ajouter…"
    />
  );
}

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("TagInput", () => {
  it("affiche les puces mono avec un bouton « Retirer R-001 »", async () => {
    render(<Tags />);
    expect(screen.getByText("R-001")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Retirer R-001" }));
    expect(screen.queryByText("R-001")).toBeNull();
  });

  it("Entrée ajoute la saisie ; doublon ignoré ; saisie vidée", async () => {
    render(<Tags />);
    const input = screen.getByRole("combobox", { name: "Liens : ajouter" });
    await userEvent.type(input, "P-reserver{Enter}");
    expect(screen.getByText("P-reserver")).toBeVisible();
    expect(input).toHaveValue("");
    await userEvent.type(input, "R-001{Enter}");
    expect(screen.getAllByText("R-001")).toHaveLength(1);
  });

  it("suggestions : liste, flèches puis Entrée choisissent ; Échap ferme la liste seule", async () => {
    const onQuery = vi.fn();
    const onEscape = vi.fn();
    render(
      // biome-ignore lint/a11y/noStaticElementInteractions: sonde des touches qui remontent
      <div onKeyDown={(event) => event.key === "Escape" && onEscape()}>
        <Tags onQuery={onQuery} />
      </div>,
    );
    const input = screen.getByRole("combobox", { name: "Liens : ajouter" });
    await userEvent.type(input, "F-0");
    expect(onQuery).toHaveBeenLastCalledWith("F-0");
    const list = screen.getByRole("listbox");
    expect(within(list).getAllByRole("option")).toHaveLength(2);
    await userEvent.keyboard("{ArrowDown}{ArrowDown}");
    expect(input).toHaveAttribute("aria-activedescendant", expect.stringContaining("option"));
    await userEvent.keyboard("{Enter}");
    expect(screen.getByText("F-004")).toBeVisible();
    await userEvent.type(input, "F-0");
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(onEscape).not.toHaveBeenCalled();
  });

  it("annonce le nombre de résultats (région vocale polie)", async () => {
    render(<Tags />);
    await userEvent.type(screen.getByRole("combobox", { name: "Liens : ajouter" }), "F");
    expect(screen.getByText("2 résultats")).toBeInTheDocument();
  });

  it("Retour arrière dans la saisie vide retire la dernière puce", async () => {
    render(<Tags />);
    await userEvent.type(screen.getByRole("combobox", { name: "Liens : ajouter" }), "{Backspace}");
    expect(screen.queryByText("R-001")).toBeNull();
  });

  it("refus d'une valeur par `validate` : message et puce non ajoutée", async () => {
    const onChange = vi.fn();
    render(
      <TagInput
        label="Liens"
        value={[]}
        onChange={onChange}
        validate={(v) => (v.startsWith("F-") ? "Préfixe F- non accepté." : null)}
      />,
    );
    await userEvent.type(screen.getByRole("combobox", { name: "Liens : ajouter" }), "F-001{Enter}");
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Préfixe F- non accepté.");
  });
});

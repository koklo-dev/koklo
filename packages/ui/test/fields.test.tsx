// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  SearchField,
  Select,
  SelectTrigger,
  SelectValue,
  Textarea,
} from "../src/index.ts";

/** TK-138 lot C : Input 40/36, SearchField, Textarea, Field, Select. */

describe("Input", () => {
  it("défaut h-10 rounded-lg bg-background text-body px-3 border-border", () => {
    render(<Input aria-label="Plafond" />);
    const input = screen.getByRole("textbox", { name: "Plafond" });
    for (const c of ["h-10", "rounded-lg", "bg-background", "text-body", "px-3", "border-border"]) {
      expect(input).toHaveClass(c);
    }
  });

  it("fieldSize sm = h-9 ; mono = font-mono", () => {
    render(<Input aria-label="Clé" fieldSize="sm" mono />);
    const input = screen.getByRole("textbox", { name: "Clé" });
    expect(input).toHaveClass("h-9", "font-mono");
    expect(input).not.toHaveClass("h-10");
  });

  it("invalide : aria-invalid:border-destructive ; désactivé : pointillé sans opacity-50", () => {
    render(<Input aria-label="Plafond" disabled />);
    const { className } = screen.getByRole("textbox", { name: "Plafond" });
    expect(className).toMatch(/aria-invalid:border-destructive/);
    expect(className).toMatch(/disabled:border-dashed/);
    expect(className).toMatch(/disabled:border-border-strong/);
    expect(className).toMatch(/disabled:bg-surface/);
    expect(className).toMatch(/disabled:text-muted-foreground/);
    expect(className).not.toMatch(/opacity-50/);
  });
});

describe("Textarea (lot C)", () => {
  it("px-3 py-2.5 leading-normal rounded-lg, désactivé pointillé sans opacity-50", () => {
    render(<Textarea aria-label="Note" />);
    const field = screen.getByRole("textbox", { name: "Note" });
    expect(field).toHaveClass("px-3", "py-2.5", "leading-normal", "rounded-lg", "bg-background");
    expect(field.className).toMatch(/disabled:border-dashed/);
    expect(field.className).not.toMatch(/opacity-50/);
  });
});

describe("SearchField", () => {
  it("champ de recherche h-9 nommé par son label sr-only, icône search 18", () => {
    const { container } = render(<SearchField label="Rechercher une fonctionnalité" />);
    const input = screen.getByRole("searchbox", { name: "Rechercher une fonctionnalité" });
    expect(input).toHaveClass("h-9");
    expect(container.querySelector("label")).toHaveClass("sr-only");
    expect(container.querySelector("svg[data-icon='search']")).toHaveAttribute("width", "18");
  });

  it("onClear : bouton « Effacer » visible seulement quand il y a une valeur", async () => {
    const { rerender } = render(
      <SearchField label="Rechercher" value="" onChange={() => {}} onClear={() => {}} />,
    );
    expect(screen.queryByRole("button", { name: "Effacer" })).toBeNull();
    rerender(<SearchField label="Rechercher" value="F-1" onChange={() => {}} onClear={() => {}} />);
    expect(screen.getByRole("button", { name: "Effacer" })).toBeVisible();
  });
});

describe("Field", () => {
  it("required : astérisque primary aria-hidden + « obligatoire » sr-only", () => {
    render(
      <Field>
        <FieldLabel htmlFor="n" required>
          Nom
        </FieldLabel>
        <Input id="n" required />
      </Field>,
    );
    expect(screen.getByText("obligatoire")).toHaveClass("sr-only");
    const star = screen.getByText("*");
    expect(star).toHaveClass("text-primary");
    expect(star).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByRole("textbox", { name: /Nom/ })).toBeVisible();
  });

  it("optional : « (facultatif) » 400 muted", () => {
    render(
      <FieldLabel htmlFor="n" optional>
        Note
      </FieldLabel>,
    );
    expect(screen.getByText("(facultatif)")).toHaveClass("font-normal", "text-muted-foreground");
  });

  it("aide 12 muted et erreur annoncée (role=alert) avec icône error 16", () => {
    const { container } = render(
      <Field>
        <FieldDescription>Montant en euros</FieldDescription>
        <FieldError>Valeur trop élevée</FieldError>
      </Field>,
    );
    expect(screen.getByText("Montant en euros")).toHaveClass(
      "text-muted-foreground",
      "text-caption",
    );
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Valeur trop élevée");
    expect(container.querySelector("[role='alert'] svg[data-icon='error']")).toHaveAttribute(
      "width",
      "16",
    );
  });
});

describe("Select", () => {
  it("trigger h-10 rounded-lg, keyboard_arrow_down 18 ; size sm h-9", () => {
    const { container } = render(
      <>
        <Select>
          <SelectTrigger aria-label="Rôle">
            <SelectValue placeholder="Choisir" />
          </SelectTrigger>
        </Select>
        <Select>
          <SelectTrigger aria-label="Petit" size="sm">
            <SelectValue placeholder="Choisir" />
          </SelectTrigger>
        </Select>
      </>,
    );
    const trigger = screen.getByRole("combobox", { name: "Rôle" });
    expect(trigger).toHaveClass("h-10", "rounded-lg");
    expect(trigger.className).toMatch(/disabled:border-dashed/);
    expect(trigger.className).not.toMatch(/opacity-50/);
    expect(container.querySelector("svg[data-icon='keyboard_arrow_down']")).toHaveAttribute(
      "width",
      "18",
    );
    expect(screen.getByRole("combobox", { name: "Petit" })).toHaveClass("h-9");
  });
});

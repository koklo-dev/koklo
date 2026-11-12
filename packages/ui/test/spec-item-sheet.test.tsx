// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  Field,
  FieldLabel,
  RadioPill,
  RadioPillGroup,
  SpecItemSheet,
  type SpecItemSheetProps,
} from "../src/index.ts";

/** TK-101 lot B, cas 1 (fiche §3) : panneau d'édition, maquette 16 l.58-108 et 196-229. */

const base: SpecItemSheetProps = {
  open: true,
  mode: "create",
  icon: "task_alt",
  title: "Nouvelle fonctionnalité",
  subtitle: "Fonctionnel · identifiant attribué à l'enregistrement",
  idTag: "F-249",
  closeLabel: "Fermer le panneau",
  dirty: false,
  file: "features/F-249-liste-attente.md",
  commitNote: "un commit à l'enregistrement",
  saveLabel: "Enregistrer dans la spec",
  onSave: vi.fn(),
  onClose: vi.fn(),
  children: <p>Corps</p>,
};

const assist = {
  hint: "ex. « le client s'inscrit sur liste d'attente »",
  value: "",
  onChange: vi.fn(),
  onPrefill: vi.fn(),
  busy: false,
};

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("SpecItemSheet : les 4 modes", () => {
  it("création : en-tête, encadré « Décrire en une phrase », pied de la maquette", () => {
    render(<SpecItemSheet {...base} assist={assist} />);
    const dialog = screen.getByRole("dialog", { name: "Nouvelle fonctionnalité" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveClass("md:max-w-[540px]");
    expect(
      within(dialog).getByText("Fonctionnel · identifiant attribué à l'enregistrement"),
    ).toBeVisible();
    expect(within(dialog).getByText("F-249")).toBeVisible();
    const box = within(dialog).getByRole("region", { name: "Aide de l'agent" });
    expect(box).toHaveTextContent("Décrire en une phrase, l'agent remplit le formulaire");
    expect(within(box).getByRole("textbox", { name: "Description pour l'agent" })).toBeVisible();
    expect(within(box).getByRole("button", { name: "Préremplir" })).toBeVisible();
    expect(box).toHaveTextContent(
      "Rien n'est enregistré tant que vous n'avez pas cliqué sur « Enregistrer ».",
    );
    expect(dialog).toHaveTextContent("features/F-249-liste-attente.md");
    expect(dialog).toHaveTextContent("un commit à l'enregistrement");
    expect(within(dialog).getByRole("button", { name: "Annuler" })).toBeVisible();
    expect(within(dialog).getByRole("button", { name: "Enregistrer dans la spec" })).toBeVisible();
    expect(within(dialog).queryByRole("button", { name: "Supprimer" })).toBeNull();
  });

  it("préremplie : bandeau « Préremplie par l'agent » et « Effacer », sans encadré d'aide", async () => {
    const onClear = vi.fn();
    render(<SpecItemSheet {...base} filled={{ onClear }} />);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).queryByRole("region", { name: "Aide de l'agent" })).toBeNull();
    const banner = within(dialog).getByRole("status");
    expect(banner).toHaveTextContent(
      "Préremplie par l'agent. Vérifiez chaque champ marqué avant d'enregistrer.",
    );
    await userEvent.click(within(banner).getByRole("button", { name: "Effacer" }));
    expect(onClear).toHaveBeenCalledOnce();
  });

  it("modification : avertissement du livrable validé, Supprimer, libellé du bouton", async () => {
    const onDelete = vi.fn();
    render(
      <SpecItemSheet
        {...base}
        mode="edit"
        title="Modifier la fonctionnalité"
        saveLabel="Enregistrer les modifications"
        commitNote="un commit, relu dans l'historique"
        warning="Ce livrable est validé : enregistrer cette modification annule sa validation, qui devra être reposée sur la nouvelle version."
        onDelete={onDelete}
      />,
    );
    const dialog = screen.getByRole("dialog", { name: "Modifier la fonctionnalité" });
    expect(dialog).toHaveTextContent("Ce livrable est validé");
    expect(within(dialog).queryByRole("region", { name: "Aide de l'agent" })).toBeNull();
    await userEvent.click(within(dialog).getByRole("button", { name: "Supprimer" }));
    expect(onDelete).toHaveBeenCalledOnce();
    expect(
      within(dialog).getByRole("button", { name: "Enregistrer les modifications" }),
    ).toBeVisible();
  });

  it("erreurs : résumé en alerte", () => {
    render(
      <SpecItemSheet
        {...base}
        errorSummary="2 champs obligatoires sont vides : Titre, Description."
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "2 champs obligatoires sont vides : Titre, Description.",
    );
  });

  it("Préremplir transmet la phrase saisie ; actif même vide (l'appelant refuse une phrase vide), désactivé en cours", async () => {
    const onPrefill = vi.fn();
    const { rerender } = render(
      <SpecItemSheet {...base} assist={{ ...assist, onPrefill, value: "" }} />,
    );
    expect(screen.getByRole("button", { name: "Préremplir" })).toBeEnabled();
    rerender(<SpecItemSheet {...base} assist={{ ...assist, onPrefill, value: "une phrase" }} />);
    await userEvent.click(screen.getByRole("button", { name: "Préremplir" }));
    expect(onPrefill).toHaveBeenCalledOnce();
    rerender(
      <SpecItemSheet
        {...base}
        assist={{ ...assist, onPrefill, value: "une phrase", busy: true }}
      />,
    );
    expect(screen.getByRole("button", { name: /Préremplissage/ })).toBeDisabled();
  });
});

describe("SpecItemSheet : emplacements du pied", () => {
  it("la confirmation remplace le pied ; beforeFooter se place entre le corps et le pied", () => {
    const { rerender } = render(<SpecItemSheet {...base} beforeFooter={<p>Avancement</p>} />);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Avancement")).toBeVisible();
    expect(within(dialog).getByRole("button", { name: "Annuler" })).toBeVisible();
    rerender(<SpecItemSheet {...base} confirmation={<p>Supprimer F-001 ?</p>} />);
    expect(within(dialog).getByText("Supprimer F-001 ?")).toBeVisible();
    expect(within(dialog).queryByRole("button", { name: "Annuler" })).toBeNull();
  });

  it("« Supprimer » peut être désactivé, relié à sa raison, et porte l'identifiant donné", () => {
    render(
      <SpecItemSheet
        {...base}
        mode="edit"
        onDelete={vi.fn()}
        deleteDisabled
        deleteDescribedBy="raison"
        deleteButtonId="supprimer"
      />,
    );
    const button = screen.getByRole("button", { name: "Supprimer" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-describedby", "raison");
    expect(button).toHaveAttribute("id", "supprimer");
  });

  it("le focus initial peut être repris par l'appelant (onOpenAutoFocus)", () => {
    render(
      <SpecItemSheet
        {...base}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          document.getElementById("cible")?.focus();
        }}
      >
        <input id="cible" aria-label="Cible" />
      </SpecItemSheet>,
    );
    expect(screen.getByRole("textbox", { name: "Cible" })).toHaveFocus();
  });
});

describe("SpecItemSheet : clavier et fermeture", () => {
  it("Échap sans saisie changée ferme sans confirmation", async () => {
    const onClose = vi.fn();
    render(<SpecItemSheet {...base} onClose={onClose} />);
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledOnce();
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("Échap avec saisie changée demande confirmation ; « Continuer la saisie » a le focus", async () => {
    const onClose = vi.fn();
    render(<SpecItemSheet {...base} dirty onClose={onClose} />);
    await userEvent.keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();
    const confirm = await screen.findByRole("alertdialog");
    expect(within(confirm).getByRole("button", { name: "Continuer la saisie" })).toHaveFocus();
    await userEvent.click(within(confirm).getByRole("button", { name: "Fermer sans enregistrer" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("le bouton Annuler suit la même règle", async () => {
    const onClose = vi.fn();
    render(<SpecItemSheet {...base} dirty onClose={onClose} />);
    await userEvent.click(screen.getByRole("button", { name: "Annuler" }));
    expect(onClose).not.toHaveBeenCalled();
    expect(await screen.findByRole("alertdialog")).toBeVisible();
  });

  it("⌘/Ctrl+Entrée enregistre", async () => {
    const onSave = vi.fn();
    render(<SpecItemSheet {...base} onSave={onSave} />);
    screen.getByText("Corps").focus();
    await userEvent.keyboard("{Control>}{Enter}{/Control}");
    await userEvent.keyboard("{Meta>}{Enter}{/Meta}");
    expect(onSave).toHaveBeenCalledTimes(2);
  });

  it("le focus reste piégé dans le panneau", async () => {
    render(
      <SpecItemSheet {...base}>
        <input aria-label="Premier" />
      </SpecItemSheet>,
    );
    const dialog = screen.getByRole("dialog");
    for (let i = 0; i < 12; i++) await userEvent.tab();
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
  });

  it("enregistrement en cours : bouton principal désactivé et occupé", () => {
    render(<SpecItemSheet {...base} saving />);
    const save = screen.getByRole("button", { name: /Enregistrement/ });
    expect(save).toBeDisabled();
    expect(save).toHaveAttribute("aria-busy", "true");
  });
});

describe("Field agentFilled", () => {
  it("filet de 3 px et mention « proposé par l'agent » ; rien sans la prop", () => {
    render(
      <>
        <Field agentFilled data-testid="a">
          <FieldLabel>Titre</FieldLabel>
        </Field>
        <Field data-testid="b">
          <FieldLabel>Autre</FieldLabel>
        </Field>
      </>,
    );
    expect(screen.getByTestId("a")).toHaveClass("border-l-[3px]", "border-primary", "pl-3");
    expect(within(screen.getByTestId("a")).getByText("proposé par l'agent")).toBeVisible();
    expect(screen.getByTestId("b")).not.toHaveClass("border-l-[3px]");
    expect(within(screen.getByTestId("b")).queryByText("proposé par l'agent")).toBeNull();
  });
});

describe("RadioPill", () => {
  it("pastilles de 32 px ; la choisie a la bordure et le fond du ton doux", async () => {
    const onChange = vi.fn();
    render(
      <RadioPillGroup aria-label="Priorité" value="b" onValueChange={onChange}>
        <RadioPill value="a">Indispensable</RadioPill>
        <RadioPill value="b">Importante</RadioPill>
      </RadioPillGroup>,
    );
    const chosen = screen.getByRole("radio", { name: "Importante" });
    expect(chosen).toHaveClass("h-8", "rounded-full");
    expect(chosen).toBeChecked();
    await userEvent.click(screen.getByRole("radio", { name: "Indispensable" }));
    expect(onChange).toHaveBeenCalledWith("a");
  });
});

describe("SpecItemSheet : correction 1 (maquette 16 l.58-64, l.77, l.95)", () => {
  it("le pied annule la compensation de marge et prend 14 / 20 / 16", () => {
    render(<SpecItemSheet {...base} />);
    const footer = screen
      .getByText("features/F-249-liste-attente.md")
      .closest("[class*='bg-surface']");
    expect(footer).toHaveClass("mx-0", "mb-0", "px-5", "pt-3.5", "pb-4");
    expect(footer).not.toHaveClass("-mx-5");
  });

  it("le panneau n'a pas de rayon et l'identifiant est sur la ligne du titre, avant le ✕", () => {
    render(<SpecItemSheet {...base} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveClass("rounded-none");
    const tag = screen.getByText("F-249");
    const title = screen.getByRole("heading", { name: "Nouvelle fonctionnalité" });
    expect(tag.parentElement).toBe(title.closest("div")?.parentElement);
    expect(screen.getByRole("button", { name: "Fermer le panneau" })).toHaveClass("size-8");
  });

  it("l'avertissement est une note, ne rétrécit pas dans le corps défilant", () => {
    render(<SpecItemSheet {...base} warning="Ce livrable est validé." />);
    const note = screen.getByRole("note");
    expect(note).toHaveTextContent("Ce livrable est validé.");
    expect(note.parentElement).toHaveClass("[&>*]:shrink-0");
  });
});

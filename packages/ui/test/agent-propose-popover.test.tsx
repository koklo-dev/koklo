// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { AgentProposeButton, type AgentProposeOption, AgentProposePopover } from "../src/index.ts";

/** TK-99b lot A, cas 2 et 3 (maquette 21 l.57-68, 127-131, 154-155 ; maquette 10 l.388-419) : `AgentProposePopover`. */
const OPTIONS: AgentProposeOption[] = [
  {
    id: "complete",
    title: "Compléter le cahier",
    description: "Fonctionnalités manquantes.",
    countLabel: "3 critères",
  },
  {
    id: "criteria",
    title: "Écrire les critères manquants",
    description: "Un critère par fonctionnalité.",
  },
  {
    id: "update",
    title: "Mettre à jour depuis le dossier",
    description: "Reprendre les changements.",
    count: 0,
  },
  { id: "all", title: "Tout reproposer", description: "Repartir de zéro." },
];

interface DemoProps {
  onLaunch?: () => void;
  onChoice?: (id: string) => void;
  loading?: boolean;
  launchDisabled?: boolean;
}

function Demo({ onLaunch = () => undefined, onChoice, loading, launchDisabled }: DemoProps) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("complete");
  const [instruction, setInstruction] = useState("");
  return (
    <>
      <AgentProposeButton state={open ? "open" : "idle"} onClick={() => setOpen(true)} />
      <AgentProposePopover
        open={open}
        onOpenChange={setOpen}
        subtitle="Fonctionnel"
        options={OPTIONS}
        value={value}
        onValueChange={(id) => {
          setValue(id);
          onChoice?.(id);
        }}
        instruction={instruction}
        onInstructionChange={setInstruction}
        reads={["Dossier d'idée figé (idea-v1)", "Cahier fonctionnel actuel"]}
        onLaunch={onLaunch}
        loading={loading}
        launchDisabled={launchDisabled}
      />
    </>
  );
}

async function openDialog() {
  const user = userEvent.setup();
  render(<Demo />);
  await user.click(screen.getByRole("button", { name: "Proposer avec l'agent" }));
  return { user, dialog: screen.getByRole("dialog") };
}

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("AgentProposePopover", () => {
  it("dialogue modal nommé « Proposer avec l'agent », sous-titre = livrable, 520 au plus", async () => {
    const { dialog } = await openDialog();
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleName("Proposer avec l'agent");
    expect(dialog).toHaveAccessibleDescription("Fonctionnel");
    expect(dialog).toHaveClass("max-w-[520px]", "w-[calc(100%-32px)]", "rounded-dialog");
  });

  it("voile --overlay et flou 6 px sous motion-safe", async () => {
    await openDialog();
    const overlay = document.querySelector("[data-slot=dialog-overlay]");
    expect(overlay).toHaveClass("bg-overlay", "motion-safe:backdrop-blur-[6px]");
  });

  it("choix en cartes radio : option à compte nul absente, première « Recommandé » + compte en pastille --soft", async () => {
    const { dialog } = await openDialog();
    const group = within(dialog).getByRole("radiogroup", { name: "Ce que l'agent va faire" });
    const radios = within(group).getAllByRole("radio");
    expect(radios.map((r) => r.textContent)).toEqual([
      expect.stringContaining("Compléter le cahier"),
      expect.stringContaining("Écrire les critères manquants"),
      expect.stringContaining("Tout reproposer"),
    ]);
    expect(radios[0]).toHaveAttribute("aria-checked", "true");
    expect(radios[1]).toHaveAttribute("aria-checked", "false");
    expect(within(radios[0] as HTMLElement).getByText("Recommandé")).toHaveClass(
      "bg-primary",
      "text-primary-foreground",
      "h-[18px]",
    );
    expect(within(radios[0] as HTMLElement).getByText("3 critères")).toHaveClass(
      "bg-secondary",
      "text-secondary-foreground",
      "h-[18px]",
    );
    expect(within(radios[1] as HTMLElement).queryByText("Recommandé")).toBeNull();
  });

  it("flèches du clavier : changent le choix", async () => {
    const onChoice = vi.fn();
    const user = userEvent.setup();
    render(<Demo onChoice={onChoice} />);
    await user.click(screen.getByRole("button", { name: "Proposer avec l'agent" }));
    const first = screen.getByRole("radio", { name: /Compléter le cahier/ });
    first.focus();
    // Radix active le choix au focus tant que la flèche est enfoncée : pas de keyup dans ce test.
    fireEvent.keyDown(first, { key: "ArrowDown" });
    await waitFor(() => expect(onChoice).toHaveBeenLastCalledWith("criteria"));
    expect(screen.getByRole("radio", { name: /Écrire les critères/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("consigne : la textarea reçoit value (jamais en enfant), 500 caractères au plus", async () => {
    const { user, dialog } = await openDialog();
    const field = within(dialog).getByRole("textbox", { name: /Consigne/ }) as HTMLTextAreaElement;
    expect(field).toHaveAttribute("maxlength", "500");
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await user.type(field, "Cas limites");
    expect(field.value).toBe("Cas limites");
    // React avertit si une textarea reçoit un enfant ou un défaut en plus de value.
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });

  it("puces « L'agent lit » reprises de reads, pied « Rien n'est enregistré sans votre relecture. » sur sa ligne", async () => {
    const { dialog } = await openDialog();
    const reads = within(dialog).getByRole("list", { name: "L'agent lit" });
    expect(
      within(reads)
        .getAllByRole("listitem")
        .map((li) => li.textContent),
    ).toEqual(["Dossier d'idée figé (idea-v1)", "Cahier fonctionnel actuel"]);
    expect(
      within(dialog)
        .getByText("Rien n'est enregistré sans votre relecture.")
        .closest("[class*=basis-full]"),
    ).not.toBeNull();
  });

  it("Lancer appelle onLaunch ; Annuler, Fermer, Échap et le fond ferment", async () => {
    const onLaunch = vi.fn();
    const user = userEvent.setup();
    render(<Demo onLaunch={onLaunch} />);
    const trigger = screen.getByRole("button", { name: "Proposer avec l'agent" });
    await user.click(trigger);
    await user.click(screen.getByRole("button", { name: "Lancer" }));
    expect(onLaunch).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Annuler" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    await user.click(trigger);
    await user.click(screen.getByRole("button", { name: "Fermer" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    await user.click(trigger);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    await user.click(trigger);
    await user.click(document.querySelector("[data-slot=dialog-overlay]") as Element);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("focus piégé dans la modale (Tab boucle), puis rendu au bouton à la fermeture", async () => {
    const user = userEvent.setup();
    render(<Demo />);
    const trigger = screen.getByRole("button", { name: "Proposer avec l'agent" });
    await user.click(trigger);
    const dialog = screen.getByRole("dialog");
    for (let i = 0; i < 12; i += 1) {
      await user.tab();
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
    await user.keyboard("{Escape}");
    expect(trigger).toHaveFocus();
  });

  it("chargement des options : squelette, Lancer inactif", async () => {
    const user = userEvent.setup();
    render(<Demo loading />);
    await user.click(screen.getByRole("button", { name: "Proposer avec l'agent" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).queryAllByRole("radio")).toHaveLength(0);
    expect(within(dialog).getByRole("group", { name: "Ce que l'agent va faire" })).toHaveAttribute(
      "aria-busy",
      "true",
    );
    expect(within(dialog).getByRole("button", { name: "Lancer" })).toBeDisabled();
  });

  it("Lancer inactif sur demande (launchDisabled)", async () => {
    const user = userEvent.setup();
    render(<Demo launchDisabled />);
    await user.click(screen.getByRole("button", { name: "Proposer avec l'agent" }));
    expect(screen.getByRole("button", { name: "Lancer" })).toBeDisabled();
  });
});

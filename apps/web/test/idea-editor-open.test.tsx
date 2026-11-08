import { render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { IdeaEditor } from "../src/components/idea-editor.tsx";

const PAGE = {
  id: "p1",
  title: "Périmètre",
  version: 2,
  contentMd:
    "### Première version\n\nTexte.\n\n- [x] Réserver un créneau\n- [ ] Agenda synchronisé\n",
} as never;

function open(editable = true) {
  const onChange = vi.fn();
  render(
    <IdeaEditor
      page={PAGE}
      editable={editable}
      replacement={null}
      onChange={onChange}
      onBlur={() => undefined}
    />,
  );
  return onChange;
}

describe("Éditeur d'idée : ouverture et tâches (TK-89)", () => {
  it("ouvrir une page ne transmet aucun contenu différent de celui chargé", async () => {
    const onChange = open();
    await screen.findByRole("checkbox", { name: "Réserver un créneau" });
    await new Promise((resolve) => setTimeout(resolve, 100));
    for (const [content] of onChange.mock.calls)
      expect(content).toBe((PAGE as { contentMd: string }).contentMd);
  });

  it("les tâches sont des cases nommées par leur texte, avec l'état en aria-checked", async () => {
    open();
    const done = await screen.findByRole("checkbox", { name: "Réserver un créneau" });
    const todo = screen.getByRole("checkbox", { name: "Agenda synchronisé" });
    expect(done).toHaveAttribute("aria-checked", "true");
    expect(todo).toHaveAttribute("aria-checked", "false");
    expect(done.className).toContain("size-6");
  });

  it("cocher une tâche enregistre le nouvel état", async () => {
    const onChange = open();
    const todo = await screen.findByRole("checkbox", { name: "Agenda synchronisé" });
    await userEvent.click(todo);
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(onChange.mock.calls.at(-1)?.[0]).toContain("- [x] Agenda synchronisé");
  });

  it("en lecture seule, les cases sont désactivées", async () => {
    open(false);
    expect(await screen.findByRole("checkbox", { name: "Agenda synchronisé" })).toBeDisabled();
  });
});

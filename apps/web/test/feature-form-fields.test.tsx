import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clickSave,
  fillMinimum,
  linkField,
  liveText,
  openCreate,
  openEdit,
  openLinks,
  type Panel,
  pick,
  saveButton,
  serveWrite,
  setText,
  submitInputs,
  titleField,
} from "./support/feature-form.tsx";
import { DETAIL } from "./support/features.tsx";
import { polyfillRadix, resetWebMocks, watchUrl } from "./support/web-mocks.ts";

vi.mock("next/navigation", async () => {
  const m = await import("./support/web-mocks.ts");
  return {
    useRouter: () => m.router,
    usePathname: () => m.pathname.current,
    useSearchParams: m.useSearchParams,
  };
});
vi.mock("../src/lib/auth-client.ts", async () => ({
  authClient: (await import("./support/web-mocks.ts")).authClient,
}));
vi.mock("../src/lib/orpc.ts", async () => ({
  orpc: (await import("./support/web-mocks.ts")).orpc,
}));

/**
 * TK-48 / 48e, champs, validation et éditeur de critères (S-feature-form §3, §4.3, AC-48-24).
 * Les champs suivent `featureFields` du contrat 0.7.0.
 */
beforeEach(() => {
  resetWebMocks();
  polyfillRadix();
  watchUrl();
  localStorage.clear();
  serveWrite();
});

const LINK_LABELS = [
  "Écrans",
  "Rôles",
  "Règles",
  "Tables",
  "Endpoints",
  "Exigences non fonctionnelles",
] as const;
const criterion = (panel: Panel, n: number) =>
  panel.getByRole("group", { name: new RegExp(`^Critère ${n}\\b`) });
const stepSelects = (group: Panel) => group.queryAllByRole("combobox", { name: "Type d'étape" });

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("Création : champs et valeurs initiales (§3.1)", () => {
  it("titre et priorité portent « (obligatoire) » dans leur libellé écrit", async () => {
    const panel = await openCreate();
    expect(panel.getByRole("textbox", { name: "Titre (obligatoire)" })).toBeVisible();
    expect(panel.getByRole("combobox", { name: "Priorité (obligatoire)" })).toBeVisible();
  });

  it("priorité sans aucune présélection : « Choisir une priorité »", async () => {
    const panel = await openCreate();
    expect(panel.getByRole("combobox", { name: "Priorité (obligatoire)" })).toHaveTextContent(
      "Choisir une priorité",
    );
  });

  it("options de priorité en toutes lettres, dans l'ordre du contrat", async () => {
    const panel = await openCreate();
    await userEvent.click(panel.getByRole("combobox", { name: "Priorité (obligatoire)" }));
    expect((await screen.findAllByRole("option")).map((o) => o.textContent)).toEqual([
      "Indispensable",
      "Importante",
      "Souhaitable",
      "Reportée",
    ]);
  });

  it("statut : présélection « Brouillon », quatre options avec libellés de la liste", async () => {
    const panel = await openCreate();
    const select = panel.getByRole("combobox", { name: "Statut" });
    expect(select).toHaveTextContent("Brouillon");
    await userEvent.click(select);
    expect((await screen.findAllByRole("option")).map((o) => o.textContent)).toEqual([
      "Brouillon",
      "Spécifiée",
      "Implémentée",
      "Adoptée",
    ]);
  });

  it("description : texte brut multiligne avec son aide reliée par aria-describedby", async () => {
    const panel = await openCreate();
    const field = panel.getByRole("textbox", { name: "Description" });
    expect(field.tagName).toBe("TEXTAREA");
    expect(field).toHaveAccessibleDescription(
      /Texte brut : les retours à la ligne sont conservés\./,
    );
  });

  it("aucun champ de saisie pour l'identifiant F-nnn, la branche, la version ou la clé", async () => {
    const panel = await openCreate();
    for (const forbidden of [
      /identifiant/i,
      /branche/i,
      /version/i,
      /clé/i,
      /message/i,
      /chemin/i,
    ]) {
      expect(panel.queryByRole("textbox", { name: forbidden })).toBeNull();
    }
  });

  it("« Éléments liés » : fermé par défaut ; ouvert, six champs multilignes avec exemple", async () => {
    const panel = await openCreate();
    const trigger = panel.getByRole("button", { name: /Éléments liés/ });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(panel.queryByRole("textbox", { name: "Écrans" })).toBeNull();
    await userEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    for (const label of LINK_LABELS) {
      expect(linkField(panel, label).tagName).toBe("TEXTAREA");
    }
    expect(panel.getByText(/un identifiant par ligne/i)).toBeVisible();
    for (const example of [
      "S-inscription",
      "RL-admin",
      "R-001",
      "T-utilisateur",
      "E-connexion",
      "NFR-performance",
    ]) {
      expect(panel.getByText(example, { exact: false })).toBeInTheDocument();
    }
  });

  it("compteur « n / 200 » sur le titre, annoncé à partir de 180 caractères", async () => {
    const panel = await openCreate();
    await setText(titleField(panel), "a".repeat(185));
    expect(await panel.findByText("185 / 200")).toBeVisible();
  });

  it("aucun critère au départ ; « Ajouter un critère » proposé", async () => {
    const panel = await openCreate();
    expect(panel.queryAllByRole("group", { name: /^Critère/ })).toHaveLength(0);
    expect(panel.getByRole("button", { name: "Ajouter un critère" })).toBeVisible();
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("Modification : préremplissage depuis spec.getFeature (§4.2)", () => {
  it("reprend titre, priorité, statut, description tels quels", async () => {
    const panel = await openEdit();
    expect(titleField(panel)).toHaveValue("Connexion par e-mail");
    expect(panel.getByRole("combobox", { name: "Priorité (obligatoire)" })).toHaveTextContent(
      "Indispensable",
    );
    expect(panel.getByRole("combobox", { name: "Statut" })).toHaveTextContent("Brouillon");
    expect(panel.getByRole("textbox", { name: "Description" })).toHaveValue(DETAIL.description);
  });

  it("critères existants : fieldset « Critère n » avec AC-n en lecture seule et leurs étapes", async () => {
    const panel = await openEdit();
    const first = within(criterion(panel, 1));
    expect(first.getByText("AC-1")).toBeVisible();
    expect(first.queryByText("Nouveau")).toBeNull();
    expect(first.getByRole("textbox", { name: "Titre du critère" })).toHaveValue(
      "Connexion réussie",
    );
    expect(
      first
        .getAllByRole("textbox", { name: "Texte de l'étape" })
        .map((t) => (t as HTMLInputElement).value),
    ).toEqual([
      "un compte existant",
      "la personne saisit son adresse",
      "elle accède à ses projets",
      "un message de bienvenue s'affiche",
    ]);
    expect(stepSelects(first).map((s) => s.textContent)).toEqual([
      "Étant donné",
      "Quand",
      "Alors",
      "Et",
    ]);
    const second = within(criterion(panel, 2));
    expect(second.getByText("AC-2")).toBeVisible();
    expect(second.getByRole("textbox", { name: "Titre du critère" })).toHaveValue(
      "Adresse inconnue",
    );
  });

  it("liens remplis : la section est ouverte, un identifiant par ligne", async () => {
    const panel = await openEdit();
    expect(panel.getByRole("button", { name: /Éléments liés/ })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(linkField(panel, "Écrans")).toHaveValue("S-login");
    expect(linkField(panel, "Rôles")).toHaveValue("RL-owner");
    expect(linkField(panel, "Règles")).toHaveValue("R-001");
    expect(linkField(panel, "Tables")).toHaveValue("T-user");
    expect(linkField(panel, "Endpoints")).toHaveValue("E-login");
    expect(linkField(panel, "Exigences non fonctionnelles")).toHaveValue("NFR-latence");
  });

  it("sans aucune modification : « Enregistrer » désactivé, relié à « Aucune modification à enregistrer. »", async () => {
    const panel = await openEdit();
    const save = saveButton(panel);
    expect(save).toBeDisabled();
    expect(save).toHaveAccessibleDescription("Aucune modification à enregistrer.");
    await setText(titleField(panel), "Un autre titre");
    await waitFor(() => expect(save).toBeEnabled());
    expect(save).not.toHaveAccessibleDescription("Aucune modification à enregistrer.");
  });

  it("revenir à la valeur d'origine désactive de nouveau « Enregistrer »", async () => {
    const panel = await openEdit();
    await setText(titleField(panel), "Autre");
    await setText(titleField(panel), "Connexion par e-mail");
    await waitFor(() => expect(saveButton(panel)).toBeDisabled());
  });

  it("aucun bouton de suppression dans ce sous-lot (lot 48e-2)", async () => {
    const panel = await openEdit();
    expect(panel.queryByRole("button", { name: /Supprimer/ })).toBeNull();
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("Validation côté client (§4.3)", () => {
  it("envoi invalide : aucun appel réseau, résumé en alerte « Corrigez 2 points avant d'enregistrer »", async () => {
    const panel = await openCreate();
    await clickSave(panel);
    const summary = await panel.findByRole("alert");
    expect(within(summary).getByText("Corrigez 2 points avant d'enregistrer")).toBeVisible();
    expect(within(summary).getByRole("link", { name: "Saisissez un titre." })).toBeVisible();
    expect(within(summary).getByRole("link", { name: "Choisissez une priorité." })).toBeVisible();
    expect(submitInputs()).toEqual([]);
  });

  it("singulier : « Corrigez 1 point avant d'enregistrer »", async () => {
    const panel = await openCreate();
    await setText(titleField(panel), "Un titre");
    await clickSave(panel);
    expect(await panel.findByText("Corrigez 1 point avant d'enregistrer")).toBeVisible();
  });

  it("le focus va sur le titre du résumé (tabindex -1)", async () => {
    const panel = await openCreate();
    await clickSave(panel);
    const heading = await panel.findByText("Corrigez 2 points avant d'enregistrer");
    await waitFor(() => expect(heading).toHaveFocus());
    expect(heading).toHaveAttribute("tabindex", "-1");
  });

  it('chaque lien du résumé est un vrai <a href="#champ"> qui place le focus sur le champ', async () => {
    const panel = await openCreate();
    await clickSave(panel);
    const link = await panel.findByRole("link", { name: "Saisissez un titre." });
    expect(link.getAttribute("href")).toMatch(/^#.+/);
    await userEvent.click(link);
    await waitFor(() => expect(titleField(panel)).toHaveFocus());
    await userEvent.click(panel.getByRole("link", { name: "Choisissez une priorité." }));
    await waitFor(() =>
      expect(panel.getByRole("combobox", { name: "Priorité (obligatoire)" })).toHaveFocus(),
    );
  });

  it("champ en erreur : aria-invalid, message texte relié par aria-describedby (pas la couleur seule)", async () => {
    const panel = await openCreate();
    await clickSave(panel);
    await panel.findByRole("alert");
    const title = titleField(panel);
    expect(title).toHaveAttribute("aria-invalid", "true");
    expect(title).toHaveAccessibleDescription(/Saisissez un titre\./);
    expect(panel.getByRole("combobox", { name: "Priorité (obligatoire)" })).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });

  it("à la perte du focus d'un champ déjà touché, l'erreur apparaît sans envoi", async () => {
    const panel = await openCreate();
    await userEvent.click(titleField(panel));
    await userEvent.tab();
    expect(await panel.findByText("Saisissez un titre.")).toBeVisible();
    expect(titleField(panel)).toHaveAttribute("aria-invalid", "true");
    expect(submitInputs()).toEqual([]);
  });

  it("titre d'espaces seulement : « Saisissez un titre. »", async () => {
    const panel = await openCreate();
    await setText(titleField(panel), "    ");
    await clickSave(panel);
    expect(await panel.findByRole("link", { name: "Saisissez un titre." })).toBeVisible();
  });

  it("titre de 201 caractères : « Le titre ne doit pas dépasser 200 caractères. »", async () => {
    const panel = await openCreate();
    await fillMinimum(panel, "a".repeat(201));
    await clickSave(panel);
    expect(
      await panel.findByRole("link", { name: "Le titre ne doit pas dépasser 200 caractères." }),
    ).toBeVisible();
    expect(submitInputs()).toEqual([]);
  });

  it("ligne de lien invalide : message avec le numéro de ligne, section repliée ouverte, champ marqué", async () => {
    const panel = await openCreate();
    await fillMinimum(panel);
    await openLinks(panel);
    await setText(linkField(panel, "Écrans"), "S-login\nnon valide");
    await userEvent.click(panel.getByRole("button", { name: /Éléments liés/ }));
    await clickSave(panel);
    const message = "La ligne 2 n'est pas un identifiant valide (exemple : S-inscription).";
    expect(await panel.findByRole("link", { name: message })).toBeVisible();
    expect(panel.getByRole("button", { name: /Éléments liés/ })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(linkField(panel, "Écrans")).toHaveAttribute("aria-invalid", "true");
    expect(linkField(panel, "Écrans")).toHaveAccessibleDescription(/La ligne 2/);
  });

  it("critère sans titre et étape sans texte : messages numérotés", async () => {
    const panel = await openCreate();
    await fillMinimum(panel);
    await userEvent.click(panel.getByRole("button", { name: "Ajouter un critère" }));
    await userEvent.click(panel.getByRole("button", { name: "Ajouter un critère" }));
    await setText(
      within(criterion(panel, 1)).getByRole("textbox", { name: "Titre du critère" }),
      "Premier",
    );
    await userEvent.click(
      within(criterion(panel, 1)).getByRole("button", { name: "Ajouter une étape" }),
    );
    await clickSave(panel);
    expect(
      await panel.findByRole("link", { name: "Saisissez le titre du critère 2." }),
    ).toBeVisible();
    expect(
      panel.getByRole("link", { name: "Saisissez le texte de l'étape 1 du critère 1." }),
    ).toBeVisible();
    expect(submitInputs()).toEqual([]);
  });

  it("une saisie corrigée fait disparaître le résumé et laisse partir l'envoi", async () => {
    const panel = await openCreate();
    await clickSave(panel);
    await panel.findByRole("alert");
    await fillMinimum(panel);
    await clickSave(panel);
    await waitFor(() => expect(submitInputs()).toHaveLength(1));
    expect(panel.queryByText(/Corrigez \d point/)).toBeNull();
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("Éditeur de critères (§3.3, §7)", () => {
  const add = async (panel: Panel) =>
    userEvent.click(panel.getByRole("button", { name: "Ajouter un critère" }));

  it("ajouter un critère : fieldset « Critère 1 », badge « Nouveau », focus sur son titre, annonce", async () => {
    const panel = await openCreate();
    await add(panel);
    const group = criterion(panel, 1);
    expect(within(group).getByText("Nouveau")).toBeVisible();
    await waitFor(() =>
      expect(within(group).getByRole("textbox", { name: "Titre du critère" })).toHaveFocus(),
    );
    expect(liveText()).toContain("Critère 1 ajouté.");
    await add(panel);
    expect(criterion(panel, 2)).toBeVisible();
    expect(liveText()).toContain("Critère 2 ajouté.");
  });

  it("les critères sont dans une liste ordonnée (ol)", async () => {
    const panel = await openCreate();
    await add(panel);
    await add(panel);
    expect(
      panel
        .getAllByRole("list")
        .some((list) => list.tagName === "OL" && within(list).queryAllByRole("group").length === 2),
    ).toBe(true);
  });

  it("phrase d'aide permanente sur la numérotation des critères", async () => {
    const panel = await openCreate();
    expect(
      panel.getByText(
        /Changer le titre d'un critère le remplace par un nouveau critère\. Les identifiants ne sont jamais réutilisés/,
      ),
    ).toBeVisible();
  });

  it("étapes : le type proposé suit Étant donné, Quand, Alors, Et, puis Et", async () => {
    const panel = await openCreate();
    await add(panel);
    const group = within(criterion(panel, 1));
    for (let i = 0; i < 5; i++)
      await userEvent.click(group.getByRole("button", { name: "Ajouter une étape" }));
    expect(stepSelects(group).map((s) => s.textContent)).toEqual([
      "Étant donné",
      "Quand",
      "Alors",
      "Et",
      "Et",
    ]);
    await waitFor(() =>
      expect(group.getAllByRole("textbox", { name: "Texte de l'étape" }).at(-1)).toHaveFocus(),
    );
  });

  it("changer le type d'une étape", async () => {
    const panel = await openCreate();
    await add(panel);
    const group = within(criterion(panel, 1));
    await userEvent.click(group.getByRole("button", { name: "Ajouter une étape" }));
    await pick(group, "Type d'étape", "Alors");
    expect(stepSelects(group)[0]).toHaveTextContent("Alors");
  });

  it("retirer une étape", async () => {
    const panel = await openCreate();
    await add(panel);
    const group = within(criterion(panel, 1));
    await userEvent.click(group.getByRole("button", { name: "Ajouter une étape" }));
    await userEvent.click(group.getByRole("button", { name: "Ajouter une étape" }));
    await userEvent.click(
      group.getAllByRole("button", { name: /^Retirer l'étape/ })[0] as HTMLElement,
    );
    expect(stepSelects(group)).toHaveLength(1);
  });

  it("critère sans étape : aide non bloquante « Ajoutez au moins une étape… », qui disparaît avec une étape", async () => {
    const panel = await openCreate();
    await add(panel);
    const hint = "Ajoutez au moins une étape pour que ce critère soit testable.";
    expect(panel.getByText(hint)).toBeVisible();
    await userEvent.click(
      within(criterion(panel, 1)).getByRole("button", { name: "Ajouter une étape" }),
    );
    expect(panel.queryByText(hint)).toBeNull();
  });

  it("monter / descendre : l'ordre change, annonce de la position, le focus reste sur un bouton du critère", async () => {
    const panel = await openCreate();
    await add(panel);
    await add(panel);
    await setText(
      within(criterion(panel, 1)).getByRole("textbox", { name: "Titre du critère" }),
      "Alpha",
    );
    await setText(
      within(criterion(panel, 2)).getByRole("textbox", { name: "Titre du critère" }),
      "Bêta",
    );
    await userEvent.click(panel.getByRole("button", { name: "Monter le critère 2" }));
    const titles = () =>
      panel
        .getAllByRole("textbox", { name: "Titre du critère" })
        .map((t) => (t as HTMLInputElement).value);
    expect(titles()).toEqual(["Bêta", "Alpha"]);
    expect(liveText()).toContain("Critère 2 déplacé en position 1.");
    expect(document.activeElement?.tagName).toBe("BUTTON");
    await userEvent.click(panel.getByRole("button", { name: "Descendre le critère 1" }));
    expect(titles()).toEqual(["Alpha", "Bêta"]);
    expect(liveText()).toContain("Critère 1 déplacé en position 2.");
  });

  it("retirer un critère : le focus va au « Retirer » du précédent, ou à « Ajouter un critère » s'il n'en reste aucun", async () => {
    const panel = await openCreate();
    await add(panel);
    await add(panel);
    await userEvent.click(panel.getByRole("button", { name: "Retirer le critère 2" }));
    expect(panel.queryAllByRole("group", { name: /^Critère/ })).toHaveLength(1);
    await waitFor(() =>
      expect(panel.getByRole("button", { name: "Retirer le critère 1" })).toHaveFocus(),
    );
    await userEvent.click(panel.getByRole("button", { name: "Retirer le critère 1" }));
    await waitFor(() =>
      expect(panel.getByRole("button", { name: "Ajouter un critère" })).toHaveFocus(),
    );
  });

  it("aucune interaction réservée à la souris : monter, descendre et retirer sont des boutons au clavier", async () => {
    const panel = await openCreate();
    await add(panel);
    await add(panel);
    const up = panel.getByRole("button", { name: "Monter le critère 2" });
    up.focus();
    await userEvent.keyboard("{Enter}");
    expect(liveText()).toContain("Critère 2 déplacé en position 1.");
  });

  it("modifier le titre d'un critère existant : « Ce critère recevra un nouvel identifiant. » et badge « Nouveau » à la place de AC-1", async () => {
    const panel = await openEdit();
    const group = within(criterion(panel, 1));
    expect(group.queryByText("Ce critère recevra un nouvel identifiant.")).toBeNull();
    await setText(
      group.getByRole("textbox", { name: "Titre du critère" }),
      "Connexion réussie (v2)",
    );
    expect(await group.findByText("Ce critère recevra un nouvel identifiant.")).toBeVisible();
    expect(group.getByText("Nouveau")).toBeVisible();
    expect(group.queryByText("AC-1")).toBeNull();
  });

  it("monter ou descendre un critère existant ne change pas son identifiant", async () => {
    const panel = await openEdit();
    await userEvent.click(panel.getByRole("button", { name: "Monter le critère 2" }));
    expect(within(criterion(panel, 1)).getByText("AC-2")).toBeVisible();
    expect(within(criterion(panel, 2)).getByText("AC-1")).toBeVisible();
    expect(within(criterion(panel, 1)).queryByText("Nouveau")).toBeNull();
  });
});

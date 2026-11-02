import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  accept,
  card,
  edit,
  inCard,
  openFraming,
  paste,
  proposeFeatures,
  saveBar,
  serveFraming,
  T1,
  T2,
} from "./support/framing.tsx";
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
 * TK-59 / 59b, édition sur place d'une proposition (S-framing §3.5) : champs, validation partagée avec le
 * formulaire de fonctionnalité, valeurs jamais réinterprétées, focus rendu à « Modifier ».
 */
beforeEach(() => {
  resetWebMocks();
  polyfillRadix();
  watchUrl();
  localStorage.clear();
  serveFraming();
});

const TITLE = /^Titre( \(obligatoire\))?$/;
const titleBox = (title: string) => inCard(title).getByRole("textbox", { name: TITLE });

async function openEditor(title = T1) {
  await openFraming();
  await proposeFeatures();
  await edit(title);
  await within(card(title)).findByRole("button", { name: "Terminer la modification" });
}

describe("Ouverture de l'édition", () => {
  it("titre, priorité, description et critères sont éditables ; rien d'autre (pas de liens)", async () => {
    await openEditor();
    expect(titleBox(T1)).toHaveValue(T1);
    expect(inCard(T1).getByRole("combobox", { name: /^Priorité/ })).toBeVisible();
    expect(
      (inCard(T1).getByRole("textbox", { name: /^Description/ }) as HTMLTextAreaElement).value,
    ).toMatch(/Description de/);
    expect(inCard(T1).getAllByRole("textbox", { name: "Titre du critère" })).toHaveLength(2);
    for (const label of ["Écrans", "Rôles", "Règles", "Tables", "Endpoints"]) {
      expect(inCard(T1).queryByRole("textbox", { name: label })).not.toBeInTheDocument();
    }
    expect(
      inCard(T1).getByText(
        "Les liens (écrans, rôles, règles) s'ajoutent ensuite depuis le formulaire de la fonctionnalité.",
      ),
    ).toBeVisible();
  });

  it("boutons « Terminer la modification » et « Annuler les modifications »", async () => {
    await openEditor();
    expect(inCard(T1).getByRole("button", { name: "Annuler les modifications" })).toBeVisible();
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("Éditions", () => {
  it("« Terminer la modification » applique le titre, referme, et rend le focus à « Modifier »", async () => {
    await openEditor();
    await paste(titleBox(T1), "Titre corrigé");
    await userEvent.click(
      inCard(T1.replace(T1, "Titre corrigé")).getByRole("button", {
        name: "Terminer la modification",
      }),
    );
    expect(screen.getByRole("heading", { name: "Titre corrigé", level: 3 })).toBeVisible();
    expect(inCard("Titre corrigé").getByRole("button", { name: "Modifier" })).toHaveFocus();
  });

  it("« Annuler les modifications » revient aux valeurs reçues", async () => {
    await openEditor();
    await paste(titleBox(T1), "Brouillon d'édition");
    await userEvent.click(inCard(T1).getByRole("button", { name: "Annuler les modifications" }));
    expect(screen.getByRole("heading", { name: T1, level: 3 })).toBeVisible();
    expect(screen.queryByText("Brouillon d'édition")).not.toBeInTheDocument();
    expect(inCard(T1).getByRole("button", { name: "Modifier" })).toHaveFocus();
  });

  it("la priorité se change par un Select", async () => {
    await openEditor();
    await userEvent.click(inCard(T1).getByRole("combobox", { name: /^Priorité/ }));
    await userEvent.click(await screen.findByRole("option", { name: "Souhaitable" }));
    await userEvent.click(inCard(T1).getByRole("button", { name: "Terminer la modification" }));
    expect(inCard(T1).getByText("Souhaitable")).toBeVisible();
  });

  it("ajouter, retirer, monter et descendre un critère, avec des libellés qui nomment le critère", async () => {
    await openEditor();
    const first = "Cas nominal de Réserver un créneau";
    const second = "Cas d'erreur de Réserver un créneau";
    await userEvent.click(
      inCard(T1).getByRole("button", { name: `Monter le critère 2 de « ${second} »` }),
    );
    const titles = () =>
      inCard(T1)
        .getAllByRole("textbox", { name: "Titre du critère" })
        .map((f) => (f as HTMLInputElement).value);
    expect(titles()).toEqual([second, first]);
    await userEvent.click(
      inCard(T1).getByRole("button", { name: `Descendre le critère 1 de « ${second} »` }),
    );
    expect(titles()).toEqual([first, second]);
    await userEvent.click(inCard(T1).getByRole("button", { name: "Ajouter un critère" }));
    expect(titles()).toHaveLength(3);
    await userEvent.click(inCard(T1).getByRole("button", { name: /^Retirer le critère 3/ }));
    expect(titles()).toHaveLength(2);
  });

  it("une valeur éditée n'est jamais réinterprétée : Markdown et HTML restent littéraux", async () => {
    await openEditor();
    await paste(titleBox(T1), "**gras** <b>html</b> [x][1]");
    await userEvent.click(inCard(T1).getByRole("button", { name: "Terminer la modification" }));
    const heading = screen.getByRole("heading", { level: 3, name: "**gras** <b>html</b> [x][1]" });
    expect(heading.querySelector("b, strong, a")).toBeNull();
  });

  it("les éditions d'une carte n'affectent pas les autres", async () => {
    await openEditor();
    await paste(titleBox(T1), "Autre");
    await userEvent.click(inCard(T1).getByRole("button", { name: "Terminer la modification" }));
    expect(screen.getByRole("heading", { name: T2, level: 3 })).toBeVisible();
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("Validation (mêmes règles que le formulaire)", () => {
  it("titre vide après rognage : « Accepter » reste actif mais renvoie le focus au premier champ en erreur", async () => {
    await openEditor();
    await paste(titleBox(T1), "   ");
    const accept = inCard(T1).getByRole("button", { name: "Accepter" });
    expect(accept).toBeEnabled();
    await userEvent.click(accept);
    const box = titleBox(T1);
    await waitFor(() => expect(box).toHaveFocus());
    expect(box).toHaveAttribute("aria-invalid", "true");
    const message = document.getElementById(
      box.getAttribute("aria-describedby")?.split(" ").at(-1) ?? "",
    );
    expect((message?.textContent ?? "").length).toBeGreaterThan(0);
    expect(inCard(T1).queryByText("Acceptée")).not.toBeInTheDocument();
    expect(saveBar()).toBeNull();
  });

  it("un résumé d'erreurs renvoie vers le champ", async () => {
    await openEditor();
    await paste(titleBox(T1), "");
    await userEvent.click(inCard(T1).getByRole("button", { name: "Accepter" }));
    const summary = await inCard(T1).findByRole("link", { name: /Titre/ });
    expect(summary.getAttribute("href")).toMatch(/^#/);
  });

  it("titre de 201 caractères : refusé ; 200 caractères : accepté", async () => {
    await openEditor();
    await paste(titleBox(T1), "x".repeat(201));
    await userEvent.click(inCard(T1).getByRole("button", { name: "Accepter" }));
    expect(titleBox(T1)).toHaveAttribute("aria-invalid", "true");
    await paste(titleBox(T1), "x".repeat(200));
    await userEvent.click(inCard(T1).getByRole("button", { name: "Accepter" }));
    await waitFor(() => expect(inCard("x".repeat(200)).getByText("Acceptée")).toBeVisible());
  });

  it("critère sans titre : refusé, message lié au champ du critère", async () => {
    await openEditor();
    const [field] = inCard(T1).getAllByRole("textbox", { name: "Titre du critère" });
    await paste(field as HTMLElement, "");
    await userEvent.click(inCard(T1).getByRole("button", { name: "Accepter" }));
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(inCard(T1).queryByText("Acceptée")).not.toBeInTheDocument();
  });

  it("étape vide : refusée", async () => {
    await openEditor();
    const [step] = inCard(T1).getAllByRole("textbox", { name: "Texte de l'étape" });
    await paste(step as HTMLElement, "");
    await userEvent.click(inCard(T1).getByRole("button", { name: "Accepter" }));
    expect(step).toHaveAttribute("aria-invalid", "true");
    expect(inCard(T1).queryByText("Acceptée")).not.toBeInTheDocument();
  });

  it("une proposition invalide déjà acceptée ne compte plus pour l'enregistrement", async () => {
    await openFraming();
    await proposeFeatures();
    await accept(T1);
    expect(saveBar()).not.toBeNull();
    await edit(T1);
    await paste(titleBox(T1), "");
    await userEvent.click(inCard(T1).getByRole("button", { name: "Terminer la modification" }));
    expect(saveBar()).toBeNull();
  });

  it("ordre Étant donné -> Quand -> Alors cassé : signalé près du critère, NON bloquant (choix à confirmer avec SPEC_INVALID)", async () => {
    await openEditor();
    const types = inCard(T1).getAllByRole("combobox", { name: "Type d'étape" });
    await userEvent.click(types[0] as HTMLElement);
    await userEvent.click(await screen.findByRole("option", { name: "Alors" }));
    expect(inCard(T1).getByText("L'ordre habituel est Étant donné, Quand, Alors.")).toBeVisible();
    await userEvent.click(inCard(T1).getByRole("button", { name: "Accepter" }));
    await waitFor(() => expect(inCard(T1).getByText("Acceptée")).toBeVisible());
  });
});

import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DETAIL,
  findTable,
  inputsOf,
  PROJECT_ID,
  renderFeatures,
  SHORT_SHA,
  serve,
  titleLink,
  visibleText,
} from "./support/features.tsx";
import { findNamed, findRole } from "./support/wait.ts";
import { polyfillRadix, procedures, resetWebMocks, watchUrl } from "./support/web-mocks.ts";

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

/** TK-48 / 48d, fiche d'une fonctionnalité en panneau (design/screens/S-features.md §3.4, §5, §7). */
beforeEach(() => {
  resetWebMocks();
  polyfillRadix();
  watchUrl();
  serve();
});

const sheet = () => findRole("dialog");
const TITLE = "Connexion par e-mail";

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("Ouverture et fermeture", () => {
  it("?feature=F-001 ouvre la fiche au chargement : dialogue modal nommé par son h2", async () => {
    renderFeatures({ search: "?feature=F-001" });
    const dialog = await sheet();
    expect(dialog).toHaveAccessibleName(TITLE);
    expect(within(dialog).getByRole("heading", { level: 2, name: TITLE })).toBeInTheDocument();
    expect(inputsOf(procedures.specGetFeature)).toEqual([
      { projectId: PROJECT_ID, specId: "F-001" },
    ]);
  });

  it("sans ?feature, spec.getFeature n'est jamais appelé et aucun dialogue n'existe", async () => {
    renderFeatures();
    await findTable();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(procedures.specGetFeature).not.toHaveBeenCalled();
  });

  it.each(["F-1", "f-001", "F-001x", "AC-1", "<script>", ""])(
    "identifiant ?feature=%s qui ne respecte pas F-nnn : ignoré (aucun dialogue, aucun appel)",
    async (value) => {
      renderFeatures({ search: `?feature=${encodeURIComponent(value)}` });
      await findTable();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(procedures.specGetFeature).not.toHaveBeenCalled();
    },
  );

  it("cliquer le titre ouvre la fiche : adresse ?feature=F-002 poussée dans l'historique", async () => {
    renderFeatures();
    await findTable();
    const length = window.history.length;
    await userEvent.click(titleLink("Tableau kanban"));
    expect(await findNamed("dialog", "Tableau kanban")).toBeVisible();
    expect(new URLSearchParams(window.location.search).get("feature")).toBe("F-002");
    expect(window.history.length).toBe(length + 1);
  });

  it("la touche Retour du navigateur ferme la fiche", async () => {
    renderFeatures();
    await findTable();
    await userEvent.click(titleLink(TITLE));
    await sheet();
    window.history.back();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(window.location.search).toBe("");
  });

  it("garde les filtres de l'adresse à l'ouverture et à la fermeture", async () => {
    renderFeatures({ search: "?status=brouillon" });
    await findTable();
    await userEvent.click(titleLink(TITLE));
    await sheet();
    expect(Object.fromEntries(new URLSearchParams(window.location.search))).toEqual({
      status: "brouillon",
      feature: "F-001",
    });
    await userEvent.click(screen.getByRole("button", { name: "Fermer" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(window.location.search).toBe("?status=brouillon");
  });

  it("« Fermer » retire le paramètre et rend le focus au lien de la ligne d'origine", async () => {
    renderFeatures();
    await findTable();
    await userEvent.click(titleLink(TITLE));
    await sheet();
    await userEvent.click(screen.getByRole("button", { name: "Fermer" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(window.location.search).toBe("");
    expect(titleLink(TITLE)).toHaveFocus();
  });

  it("Échap ferme la fiche et restitue le focus au lien d'origine", async () => {
    renderFeatures();
    await findTable();
    await userEvent.click(titleLink("Tableau kanban"));
    await sheet();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(titleLink("Tableau kanban")).toHaveFocus();
  });

  it("la croix porte l'aria-label « Fermer la fiche »", async () => {
    renderFeatures({ search: "?feature=F-001" });
    const dialog = await sheet();
    await userEvent.click(within(dialog).getByRole("button", { name: "Fermer la fiche" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(window.location.search).toBe("");
  });

  it("le focus initial est sur le titre de la fiche (on lit d'abord), pas sur « Fermer »", async () => {
    renderFeatures({ search: "?feature=F-001" });
    const dialog = await sheet();
    const title = within(dialog).getByRole("heading", { name: TITLE });
    expect(title).toHaveAttribute("tabindex", "-1");
    await waitFor(() => expect(title).toHaveFocus());
  });

  it("ouvert par ?feature= au chargement puis fermé : le focus revient au lien si la ligne est là", async () => {
    renderFeatures({ search: "?feature=F-003" });
    await sheet();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() =>
      expect(screen.getByRole("link", { name: "Export des tickets" })).toHaveFocus(),
    );
  });

  it("une fonctionnalité absente de la liste chargée mais bien formée ouvre quand même la fiche", async () => {
    procedures.specGetFeature.mockResolvedValue({ ...DETAIL, specId: "F-999", title: "Hors page" });
    renderFeatures({ search: "?feature=F-999" });
    expect(await findNamed("dialog", "Hors page")).toBeVisible();
    expect(inputsOf(procedures.specGetFeature)[0]).toMatchObject({ specId: "F-999" });
  });
});

describe("Chargement de la fiche (§4.11)", () => {
  it("en-tête immédiat depuis la ligne, puis « Chargement de la fiche… » aria-busy et squelettes", async () => {
    procedures.specGetFeature.mockImplementation(() => new Promise(() => undefined));
    renderFeatures();
    await findTable();
    await userEvent.click(titleLink(TITLE));
    const dialog = await sheet();
    expect(within(dialog).getByRole("heading", { level: 2, name: TITLE })).toBeInTheDocument();
    expect(within(dialog).getByText("F-001")).toBeInTheDocument();
    expect(within(dialog).getByText("Brouillon")).toBeInTheDocument();
    expect(within(dialog).getByText("Indispensable")).toBeInTheDocument();
    const loading = within(dialog).getByRole("status");
    expect(loading).toHaveAttribute("aria-busy", "true");
    expect(loading).toHaveTextContent("Chargement de la fiche…");
    expect(within(dialog).queryByText("Description")).not.toBeInTheDocument();
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("Contenu de la fiche — vue équipe (§3.4)", () => {
  it("en-tête : identifiant mono, titre h2, badge de statut et priorité avec les mêmes libellés que la liste", async () => {
    renderFeatures({ search: "?feature=F-001" });
    const dialog = await sheet();
    expect(within(dialog).getByText("F-001").className).toMatch(/font-mono/);
    expect(within(dialog).getByText("Brouillon")).toBeInTheDocument();
    expect(within(dialog).getByText("Indispensable")).toBeInTheDocument();
  });

  it("description en TEXTE BRUT : retours à la ligne conservés, Markdown et HTML non interprétés", async () => {
    renderFeatures({ search: "?feature=F-001" });
    const dialog = await sheet();
    await within(dialog).findByText("Description");
    const description = within(dialog).getByText(/Première ligne\./);
    expect(
      description.className.includes("whitespace-pre-wrap") ||
        description.style.whiteSpace === "pre-wrap",
    ).toBe(true);
    expect(description.textContent).toContain("**du gras**");
    expect(description.textContent).toContain("<b>du html</b>");
    expect(description.textContent).toContain("Première ligne.\n\nSeconde ligne");
    expect(description.querySelector("b, strong, em, script")).toBeNull();
  });

  it("description vide : « Aucune description. »", async () => {
    procedures.specGetFeature.mockResolvedValue({ ...DETAIL, description: "" });
    renderFeatures({ search: "?feature=F-001" });
    const dialog = await sheet();
    expect(await within(dialog).findByText("Aucune description.")).toBeInTheDocument();
  });

  it("critères d'acceptation : liste ordonnée, identifiant mono et titre ; étapes avec mot d'ouverture en gras", async () => {
    renderFeatures({ search: "?feature=F-001" });
    const dialog = await sheet();
    await within(dialog).findByText("Critères d'acceptation");
    const criteria = dialog.querySelector("ol");
    expect(criteria, "liste ordonnée (ol) des critères").not.toBeNull();
    const items = Array.from((criteria as HTMLElement).children).filter(
      (li) => li.tagName === "LI",
    ) as HTMLElement[];
    expect(items).toHaveLength(2);
    expect(within(items[0] as HTMLElement).getByText("AC-1").className).toMatch(/font-mono/);
    expect(within(items[0] as HTMLElement).getByText("Connexion réussie")).toBeInTheDocument();
    const steps = [
      ["Étant donné", "un compte existant"],
      ["Quand", "la personne saisit son adresse"],
      ["Alors", "elle accède à ses projets"],
      ["Et", "un message de bienvenue s'affiche"],
    ];
    const stepItems = within(items[0] as HTMLElement).getAllByText(
      /^(Étant donné|Quand|Alors|Et)$/,
    );
    expect(stepItems.map((el) => el.textContent)).toEqual(steps.map(([word]) => word));
    for (const [word, text] of steps) {
      const opening = within(items[0] as HTMLElement).getByText(word as string);
      expect(
        opening.closest("strong, b") ??
          (/font-(semibold|bold)/.test(opening.className) ? opening : null),
      ).not.toBeNull();
      expect(opening.parentElement).toHaveTextContent(text as string);
    }
    expect(within(items[1] as HTMLElement).getByText("AC-2")).toBeInTheDocument();
  });

  it("aucun critère : « Aucun critère d'acceptation pour le moment. »", async () => {
    procedures.specGetFeature.mockResolvedValue({ ...DETAIL, criteria: [] });
    renderFeatures({ search: "?feature=F-001" });
    const dialog = await sheet();
    expect(
      await within(dialog).findByText("Aucun critère d'acceptation pour le moment."),
    ).toBeInTheDocument();
  });

  it("éléments liés (équipe) : six groupes, valeurs en mono, non cliquables", async () => {
    renderFeatures({ search: "?feature=F-001" });
    const dialog = await sheet();
    await within(dialog).findByText("Éléments liés");
    for (const [group, value] of [
      ["Écrans", "S-login"],
      ["Rôles", "RL-owner"],
      ["Règles", "R-001"],
      ["Tables", "T-user"],
      ["Endpoints", "E-login"],
      ["Exigences non fonctionnelles", "NFR-latence"],
    ]) {
      expect(within(dialog).getByText(group as string)).toBeInTheDocument();
      const badge = within(dialog).getByText(value as string);
      expect(badge.className).toMatch(/font-mono/);
      expect(badge.closest("a, button")).toBeNull();
    }
  });

  it("un groupe vide n'est pas rendu", async () => {
    procedures.specGetFeature.mockResolvedValue({ ...DETAIL, tables: [], endpoints: [], nfr: [] });
    renderFeatures({ search: "?feature=F-001" });
    const dialog = await sheet();
    await within(dialog).findByText("Éléments liés");
    for (const group of ["Tables", "Endpoints", "Exigences non fonctionnelles"]) {
      expect(within(dialog).queryByText(group)).not.toBeInTheDocument();
    }
    expect(within(dialog).getByText("Écrans")).toBeInTheDocument();
  });

  it("aucun lien : la section « Éléments liés » disparaît entièrement", async () => {
    procedures.specGetFeature.mockResolvedValue({
      ...DETAIL,
      tables: [],
      endpoints: [],
      screens: [],
      roles: [],
      rules: [],
      nfr: [],
    });
    renderFeatures({ search: "?feature=F-001" });
    const dialog = await sheet();
    await within(dialog).findByText("Description");
    expect(within(dialog).queryByText("Éléments liés")).not.toBeInTheDocument();
  });

  it.each(["owner", "admin", "dev", "designer"] as const)(
    "%s : pied avec la version (mono, aria-label) et la ligne « Fichier » avec le chemin",
    async (role) => {
      serve(role);
      renderFeatures({ search: "?feature=F-001" });
      const dialog = await sheet();
      const version = await within(dialog).findByLabelText(`Version de la spec ${SHORT_SHA}`);
      expect(version.className).toMatch(/font-mono/);
      expect(within(dialog).getByText("Fichier")).toBeInTheDocument();
      const path = within(dialog).getByText(".koklo/features/F-001.yaml");
      expect(path.className).toMatch(/font-mono/);
    },
  );

  it("« Fermer » (outline) et croix : deux moyens de fermer", async () => {
    renderFeatures({ search: "?feature=F-001" });
    const dialog = await sheet();
    expect(within(dialog).getByRole("button", { name: "Fermer" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Fermer la fiche" })).toBeInTheDocument();
  });

  it("ne rend jamais une valeur brute du contrat ni un type d'étape brut", async () => {
    renderFeatures({ search: "?feature=F-001" });
    const dialog = await sheet();
    await within(dialog).findByText("Description");
    expect(visibleText(dialog)).not.toMatch(/\b(brouillon|etant_donne|must|alors_)\b/);
    expect(visibleText(dialog)).not.toContain("etant_donne");
  });
});

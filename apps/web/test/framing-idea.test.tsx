import { screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PROJECT_ID } from "./support/features.tsx";
import {
  aiCallCount,
  briefCalls,
  GENERATE,
  IDEA,
  liveText,
  openFraming,
  PASTED_BRIEF,
  PROPOSE,
  paste,
  proposeCalls,
  serveFraming,
  submits,
  writeIdea,
} from "./support/framing.tsx";
import { findNamed } from "./support/wait.ts";
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

/**
 * TK-59 / 59a, étape 1 « Votre idée » (S-framing §3.1 à §3.3, §4.2, §5.1) : deux chemins, compteur, précisions,
 * bloc « ce qui est envoyé » dans le DOM avant toute requête, un clic = au plus un appel IA.
 */
beforeEach(() => {
  resetWebMocks();
  polyfillRadix();
  watchUrl();
  localStorage.clear();
  serveFraming();
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("Gabarit et état initial (§3.1, §4.2)", () => {
  it("h1 « Cadrage », nom du projet, phrase d'aide, h2 « 1. Votre idée » seul", async () => {
    await openFraming();
    expect(screen.getByRole("heading", { name: "Cadrage", level: 1 })).toBeVisible();
    await findNamed("heading", /^1\. Votre idée/, { level: 2 });
    expect(screen.getByText("Alpha")).toBeVisible();
    expect(
      screen.getByText(
        "L'IA propose, vous décidez. Rien n'est enregistré dans la spec avant votre confirmation.",
      ),
    ).toBeVisible();
    expect(screen.queryByRole("heading", { name: /^2\./ })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /^3\./ })).not.toBeInTheDocument();
  });

  it("fil d'Ariane Koklo > Projets > Alpha > Cadrage, dernier maillon aria-current=page", async () => {
    await openFraming();
    const crumbs = screen.getByRole("navigation", { name: /breadcrumb|fil d'ariane/i });
    expect(crumbs).toHaveTextContent(/Koklo.*Projets.*Alpha.*Cadrage/);
    expect(within(crumbs).getByRole("link", { name: "Projets" })).toHaveAttribute(
      "href",
      "/projects",
    );
    expect(within(crumbs).getByText("Cadrage")).toHaveAttribute("aria-current", "page");
  });

  it("aucune requête ai.* ni specBatch.submit à l'ouverture", async () => {
    await openFraming();
    expect(aiCallCount()).toBe(0);
    expect(submits()).toHaveLength(0);
  });

  it("deux chemins en onglets : « Partir d'une idée » (par défaut) et « J'ai déjà un brief »", async () => {
    await openFraming();
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual(["Partir d'une idée", "J'ai déjà un brief"]);
    expect(screen.getByRole("tab", { name: "Partir d'une idée" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("le bouton est désactivé à idée vide et l'aide dit pourquoi", async () => {
    await openFraming();
    expect(screen.getByRole("button", { name: GENERATE })).toBeDisabled();
    expect(screen.getByText("Écrivez votre idée pour continuer.")).toBeVisible();
  });

  it("aide du champ et compteur « n / 8 000 » reliés par aria-describedby", async () => {
    const field = await openFraming().then(() =>
      screen.getByRole("textbox", { name: /^Votre idée/ }),
    );
    await paste(field, "abcde");
    const described = (field.getAttribute("aria-describedby") ?? "")
      .split(" ")
      .map((id) => document.getElementById(id)?.textContent ?? "");
    expect(described.join(" ")).toContain(
      "Décrivez le besoin en quelques phrases : qui, quel problème, ce que vous attendez.",
    );
    expect(described.join(" ")).toMatch(/5\s*\/\s*8\s?000/);
  });
});

describe("Compteur annoncé à partir de 7 500 caractères (§3.3, §7)", () => {
  it("rien n'est annoncé en dessous de 7 500, à aucune frappe", async () => {
    await openFraming();
    await writeIdea("a".repeat(7499));
    expect(liveText()).not.toMatch(/8\s?000/);
  });

  it("à 7 500 caractères le compteur est annoncé dans la région d'état", async () => {
    await openFraming();
    await writeIdea("a".repeat(7500));
    expect(liveText()).toMatch(/7\s?500\s*\/\s*8\s?000/);
  });
});

describe("Précisions (§3.3)", () => {
  it("repliées : « Ajouter des précisions (facultatif) », une précision par ligne", async () => {
    await openFraming();
    const trigger = screen.getByRole("button", { name: /Ajouter des précisions \(facultatif\)/ });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(trigger);
    expect(screen.getByRole("textbox", { name: /^Précisions/ })).toBeVisible();
  });

  it("plus de 10 lignes ou une ligne de plus de 1 000 caractères : erreur liée au champ, aucun appel", async () => {
    await openFraming();
    await writeIdea();
    await userEvent.click(screen.getByRole("button", { name: /Ajouter des précisions/ }));
    const field = screen.getByRole("textbox", { name: /^Précisions/ });
    await paste(field, Array.from({ length: 11 }, (_, i) => `précision ${i}`).join("\n"));
    await userEvent.click(screen.getByRole("button", { name: GENERATE }));
    expect(field).toHaveAttribute("aria-invalid", "true");
    const message = document.getElementById(
      field.getAttribute("aria-describedby")?.split(" ").at(-1) ?? "",
    );
    expect(message?.textContent ?? "").not.toBe("");
    expect(procedures.aiDraftBrief).not.toHaveBeenCalled();
    await paste(field, "x".repeat(1001));
    await userEvent.click(screen.getByRole("button", { name: GENERATE }));
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(procedures.aiDraftBrief).not.toHaveBeenCalled();
  });
});

describe("Bloc « Ce qui est envoyé à Anthropic » (§3.2)", () => {
  it("dans le DOM avant toute requête, au-dessus du bouton d'appel, texte complet, jamais replié", async () => {
    await openFraming();
    expect(aiCallCount()).toBe(0);
    const block = screen
      .getByRole("heading", { name: "Ce qui est envoyé à Anthropic", level: 3 })
      .closest("[role='alert'], [data-slot='alert'], div") as HTMLElement;
    const text = block.parentElement?.textContent ?? "";
    for (const part of [
      "sont envoyés à Anthropic (États-Unis), avec la clé de votre organisation",
      "Ne saisissez pas de données personnelles.",
      "Jamais envoyés : clés, identifiants de personnes, noms de l'organisation, du projet ou des dépôts.",
      "Rien n'est enregistré dans votre projet avant votre confirmation.",
      "Les appels sont comptés pour votre organisation.",
    ]) {
      expect(text).toContain(part);
    }
    const button = screen.getByRole("button", { name: GENERATE });
    expect(block.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(block.closest("details")).toBeNull();
    expect(block.querySelector("input[type='checkbox']")).toBeNull();
  });

  it("n'est pas l'alerte d'échec : aucun role=alert tant qu'il n'y a pas d'erreur, aucune case à cocher", async () => {
    await openFraming();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("aucun consentement mémorisé : le bouton fonctionne au premier clic et rien n'est écrit en stockage", async () => {
    await openFraming();
    await writeIdea();
    await userEvent.click(screen.getByRole("button", { name: GENERATE }));
    await findNamed("heading", /^2\. Le brief/);
    expect(Object.keys(localStorage).filter((k) => /consent/i.test(k))).toEqual([]);
  });
});

describe("« Partir d'une idée » : ai.draftBrief (§3.3, §5.1)", () => {
  it("envoie {projectId, idea} sans answers ni maxFeatures quand il n'y a pas de précisions", async () => {
    await openFraming();
    await writeIdea();
    await userEvent.click(screen.getByRole("button", { name: GENERATE }));
    await findNamed("heading", /^2\. Le brief/);
    expect(briefCalls()).toStrictEqual([{ projectId: PROJECT_ID, idea: IDEA }]);
  });

  it("les précisions, une par ligne, partent dans answers (lignes vides ignorées)", async () => {
    await openFraming();
    await writeIdea();
    await userEvent.click(screen.getByRole("button", { name: /Ajouter des précisions/ }));
    await paste(
      screen.getByRole("textbox", { name: /^Précisions/ }),
      "Mobile d'abord\n\nPaiement hors ligne\n",
    );
    await userEvent.click(screen.getByRole("button", { name: GENERATE }));
    await findNamed("heading", /^2\. Le brief/);
    expect(briefCalls()).toStrictEqual([
      { projectId: PROJECT_ID, idea: IDEA, answers: ["Mobile d'abord", "Paiement hors ligne"] },
    ]);
  });

  it("générer un brief ne lance PAS la proposition de fonctionnalités, et rien n'est écrit", async () => {
    await openFraming();
    await writeIdea();
    await userEvent.click(screen.getByRole("button", { name: GENERATE }));
    await findNamed("heading", /^2\. Le brief/);
    expect(proposeCalls()).toHaveLength(0);
    expect(submits()).toHaveLength(0);
    expect(screen.queryByRole("heading", { name: /^3\./ })).not.toBeInTheDocument();
  });

  it("maxFeatures n'est exposé nulle part", async () => {
    await openFraming();
    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText(/nombre de fonctionnalités|maxFeatures/i),
    ).not.toBeInTheDocument();
  });

  it("la section 1 reste en place, repliée en « Idée de N caractères » + « Modifier »", async () => {
    await openFraming();
    await writeIdea();
    await userEvent.click(screen.getByRole("button", { name: GENERATE }));
    await findNamed("heading", /^2\. Le brief/);
    expect(screen.getByText(`Idée de ${IDEA.length} caractères`)).toBeVisible();
    expect(screen.getByRole("button", { name: "Modifier" })).toBeVisible();
  });
});

describe("« J'ai déjà un brief » : sans appel draftBrief (§3.3)", () => {
  it("un brief collé alimente directement l'étape 2, sans aucun appel ai.*", async () => {
    await openFraming();
    await userEvent.click(screen.getByRole("tab", { name: "J'ai déjà un brief" }));
    const field = await findNamed("textbox", /^Votre brief/);
    await paste(field, PASTED_BRIEF);
    await userEvent.click(screen.getByRole("button", { name: "Relire le brief" }));
    await findNamed("heading", /^2\. Le brief/);
    expect(aiCallCount()).toBe(0);
    await userEvent.click(screen.getByRole("button", { name: PROPOSE }));
    await findNamed("heading", /^3\. Les propositions/);
    expect(briefCalls()).toHaveLength(0);
    expect(proposeCalls()).toStrictEqual([
      { projectId: PROJECT_ID, brief: expect.stringContaining("réserver est long") },
    ]);
  });

  it("le brief collé est limité à 20 000 caractères et non vide", async () => {
    await openFraming();
    await userEvent.click(screen.getByRole("tab", { name: "J'ai déjà un brief" }));
    const field = await findNamed("textbox", /^Votre brief/);
    expect(screen.getByRole("button", { name: "Relire le brief" })).toBeDisabled();
    await paste(field, "x".repeat(20_001));
    await userEvent.click(screen.getByRole("button", { name: "Relire le brief" }));
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(screen.queryByRole("heading", { name: /^2\./ })).not.toBeInTheDocument();
  });

  it("le bloc « ce qui est envoyé » reste affiché sur ce chemin aussi", async () => {
    await openFraming();
    await userEvent.click(screen.getByRole("tab", { name: "J'ai déjà un brief" }));
    expect(
      screen.getByRole("heading", { name: "Ce qui est envoyé à Anthropic", level: 3 }),
    ).toBeVisible();
  });
});

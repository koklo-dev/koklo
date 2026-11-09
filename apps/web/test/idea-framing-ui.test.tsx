import { render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { IdeaFramingNotices, IdeaFreezeConfirm } from "../src/components/idea-freeze-confirm.tsx";
import { IdeaHeader } from "../src/components/idea-header.tsx";
import { IdeaSynthesis } from "../src/components/idea-synthesis.tsx";
import { framingReason, synthesisDate } from "../src/lib/idea-labels.ts";
import { PROJECT } from "./support/idea-agent.tsx";

/** TK-91 lot B : jauge, raison, « Passer au cadrage », confirmation, « Modifié depuis », page Synthèse. */

const idleFreeze = { kind: "idle" } as const;
const BASE = {
  projectId: PROJECT,
  canPublish: true,
  canFreeze: true,
  publication: { available: true, last: null },
  maturity: { stable: 3, total: 10, missingRequired: ["Périmètre"], openQuestions: 0 },
  version: { latest: null, modifiedSince: false },
  pages: [],
};

function header(
  over: Record<string, unknown> = {},
  freeze: unknown = idleFreeze,
  onFreeze = vi.fn(),
) {
  render(
    <IdeaHeader
      model={{ ...BASE, ...over } as never}
      projectName="Portail"
      saveState="idle"
      people={[]}
      publish={{ kind: "idle" }}
      onPublish={() => undefined}
      freeze={freeze as never}
      onFreeze={onFreeze}
    />,
  );
  return onFreeze;
}

describe("framingReason", () => {
  it("dit une page au singulier, plusieurs au pluriel", () => {
    expect(framingReason(["Périmètre"])).toBe(
      "Pour passer au cadrage, il manque : Périmètre stable",
    );
    expect(framingReason(["Utilisateurs", "Périmètre"])).toBe(
      "Pour passer au cadrage, il manque : Utilisateurs et Périmètre stables",
    );
    expect(framingReason(["A", "B", "C"])).toBe(
      "Pour passer au cadrage, il manque : A, B et C stables",
    );
  });
});

describe("en-tête : jauge et passage au cadrage", () => {
  it("montre la jauge et son texte", () => {
    header();
    expect(screen.getByRole("meter", { name: "Maturité du dossier" })).toHaveAttribute(
      "aria-valuenow",
      "3",
    );
    expect(screen.getByText("3 pages stables sur 10")).toBeInTheDocument();
  });

  it("seuil non atteint : bouton désactivé relié à la raison visible", () => {
    header();
    const button = screen.getByRole("button", { name: "Passer au cadrage" });
    expect(button).toBeDisabled();
    const reason = screen.getByText("Pour passer au cadrage, il manque : Périmètre stable");
    expect(reason).toBeVisible();
    expect(button).toHaveAttribute("aria-describedby", reason.id);
  });

  it("seuil atteint : bouton actif, pas de raison, un clic lance le passage", async () => {
    const onFreeze = header({
      maturity: { stable: 4, total: 10, missingRequired: [], openQuestions: 0 },
    });
    expect(screen.queryByText(/il manque/)).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Passer au cadrage" }));
    expect(onFreeze).toHaveBeenCalledOnce();
  });

  it("client et business : jauge seule, ni bouton ni raison (jamais grisé)", () => {
    header({ canFreeze: false, canPublish: false });
    expect(screen.getByRole("meter")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Passer au cadrage" })).toBeNull();
    expect(screen.queryByText(/il manque/)).toBeNull();
  });

  it("pendant le passage : bouton occupé", () => {
    header({}, { kind: "freezing" });
    expect(screen.getByRole("button", { name: "Passer au cadrage" })).toBeDisabled();
  });
});

describe("confirmation des questions ouvertes", () => {
  it("dit le nombre au pluriel, prend le focus sur « Revoir les questions »", () => {
    render(
      <IdeaFreezeConfirm
        openQuestions={2}
        onConfirm={vi.fn()}
        onReview={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText(/Il reste 2 questions ouvertes/)).toBeInTheDocument();
    return vi.waitFor(() =>
      expect(screen.getByRole("button", { name: "Revoir les questions" })).toHaveFocus(),
    );
  });

  it("au singulier pour une question", () => {
    render(
      <IdeaFreezeConfirm
        openQuestions={1}
        onConfirm={vi.fn()}
        onReview={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText(/Il reste 1 question ouverte/)).toBeInTheDocument();
  });

  it("Échap annule ; « Passer quand même » confirme ; « Revoir » ouvre les questions", async () => {
    const onConfirm = vi.fn();
    const onReview = vi.fn();
    const onCancel = vi.fn();
    render(
      <IdeaFreezeConfirm
        openQuestions={2}
        onConfirm={onConfirm}
        onReview={onReview}
        onCancel={onCancel}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Passer quand même" }));
    await userEvent.click(screen.getByRole("button", { name: "Revoir les questions" }));
    await userEvent.keyboard("{Escape}");
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(onReview).toHaveBeenCalledOnce();
    expect(onCancel).toHaveBeenCalledOnce();
  });
});

describe("bandeaux du passage et « Modifié depuis »", () => {
  const actions = {
    confirm: vi.fn(),
    review: vi.fn(),
    cancel: vi.fn(),
    retry: vi.fn(),
    refreeze: vi.fn(),
  };
  const notices = (over: Record<string, unknown>, freeze: unknown = idleFreeze) =>
    render(
      <IdeaFramingNotices
        model={{ ...BASE, ...over } as never}
        freeze={freeze as never}
        actions={actions}
      />,
    );

  it("en cours : « Passage au cadrage… » en role=status", () => {
    notices({}, { kind: "freezing" });
    expect(screen.getByRole("status")).toHaveTextContent("Passage au cadrage…");
  });

  it("échec : « Réessayer », rien n'est perdu", async () => {
    notices({}, { kind: "failed" });
    expect(screen.getByRole("alert")).toHaveTextContent("Vos pages sont gardées");
    await userEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    expect(actions.retry).toHaveBeenCalledOnce();
  });

  const framed = {
    version: {
      latest: {
        number: 1,
        tag: "idea-v1",
        commitSha: "abc1234",
        frozenAt: "2026-11-08T10:00:00.000Z",
      },
      modifiedSince: true,
    },
  };

  it("modifié depuis idea-v1 : bouton « Figer une nouvelle version » pour l'équipe", async () => {
    notices(framed);
    expect(screen.getByText(/Modifié depuis idea-v1/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Figer une nouvelle version" }));
    expect(actions.refreeze).toHaveBeenCalledOnce();
  });

  it("le client lit l'information sans le bouton", () => {
    notices({ ...framed, canFreeze: false });
    expect(screen.getByText(/Modifié depuis idea-v1/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Figer une nouvelle version" })).toBeNull();
  });

  it("rien d'affiché sans modification depuis la version", () => {
    notices({ version: { ...framed.version, modifiedSince: false } });
    expect(screen.queryByText(/Modifié depuis/)).toBeNull();
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par état de la page
describe("page Synthèse", () => {
  const ready = (over: Record<string, unknown> = {}) => ({
    gate: "ready",
    data: {
      contentMd:
        "## Vision\n\nUn portail.\n\n[cliquez](http://evil.example) <script>alert(1)</script>",
      source: "idea-v1",
      generatedAt: "2026-11-08T10:00:00.000Z",
    },
    regenerate: vi.fn(),
    busy: false,
    failed: false,
    announcement: "",
    ...over,
  });
  const show = (synthesis: unknown, over: Record<string, unknown> = {}) =>
    render(<IdeaSynthesis model={{ ...BASE, ...over } as never} synthesis={synthesis as never} />);

  it("rend le chemin, le titre, la source et la date", () => {
    show(ready());
    expect(screen.getByText("idea/_synthese.md")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Synthèse", level: 2 })).toBeInTheDocument();
    expect(screen.getByText("générée")).toBeInTheDocument();
    expect(screen.getByText(/Générée depuis idea-v1 · /)).toBeInTheDocument();
  });

  it("lecture seule, sans lien actif ni balise exécutable", () => {
    const { container } = render(
      <IdeaSynthesis model={BASE as never} synthesis={ready() as never} />,
    );
    expect(within(container).queryByRole("link")).toBeNull();
    expect(container.querySelector("script, a, img, [contenteditable]")).toBeNull();
    expect(container).toHaveTextContent("[cliquez](http://evil.example)");
  });

  it("« Régénérer » pour l'équipe seulement", async () => {
    const synthesis = ready();
    show(synthesis);
    await userEvent.click(screen.getByRole("button", { name: "Régénérer" }));
    expect(synthesis.regenerate).toHaveBeenCalledOnce();
  });

  it("client : aucun bouton Régénérer", () => {
    show(ready(), { canFreeze: false });
    expect(screen.queryByRole("button", { name: "Régénérer" })).toBeNull();
  });

  it("aperçu : mention « Aperçu, non publié »", () => {
    show(
      ready({
        data: { contentMd: "Texte", source: null, generatedAt: "2026-11-08T10:00:00.000Z" },
      }),
    );
    expect(screen.getByText("Aperçu, non publié")).toBeInTheDocument();
    expect(screen.queryByText(/Générée depuis/)).toBeNull();
  });

  it("avant la première version : état vide et « Générer un aperçu » (équipe)", async () => {
    const synthesis = ready({ data: null });
    show(synthesis);
    expect(
      screen.getByText("La synthèse sera générée quand vous passerez au cadrage."),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Générer un aperçu" }));
    expect(synthesis.regenerate).toHaveBeenCalledOnce();
  });

  it("client : état vide sans bouton", () => {
    show(ready({ data: null }), { canFreeze: false });
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("version figée mais Synthèse absente : alerte et Régénérer", () => {
    show(ready({ data: null }), {
      version: {
        latest: { number: 1, tag: "idea-v1", commitSha: "a", frozenAt: "2026-11-08T10:00:00.000Z" },
        modifiedSince: false,
      },
    });
    expect(screen.getByRole("status")).toHaveTextContent("La synthèse n'a pas été générée");
    expect(screen.getByRole("button", { name: "Régénérer" })).toBeInTheDocument();
  });

  it("échec de régénération : alerte, texte précédent gardé", () => {
    show(ready({ failed: true }));
    expect(screen.getByRole("alert")).toHaveTextContent("n'a pas pu être régénérée");
    expect(screen.getByText(/Un portail/)).toBeInTheDocument();
  });

  it("annonce polie après régénération", () => {
    show(ready({ announcement: "Synthèse régénérée." }));
    expect(screen.getByText("Synthèse régénérée.")).toHaveAttribute("aria-live", "polite");
  });

  it("date en français", () => {
    expect(synthesisDate("2026-11-08T10:00:00.000Z")).toBe("8 novembre 2026");
  });
});

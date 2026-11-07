import { screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  button,
  credential,
  KEY_FIELD,
  keyField,
  openAiSettings,
  queryButton,
  queryKeyField,
  REMOVE,
  REPLACE,
  renderAiSettings,
  SAVE_VERIFY,
  serveAiSettings,
  statusText,
  VERIFY_AGAIN,
} from "./support/ai-settings.tsx";
import { findNamed } from "./support/wait.ts";
import { apiError, polyfillRadix, procedures, resetWebMocks } from "./support/web-mocks.ts";

vi.mock("next/navigation", async () => {
  const m = await import("./support/web-mocks.ts");
  return { useRouter: () => m.router, usePathname: () => m.pathname.current };
});
vi.mock("../src/lib/auth-client.ts", async () => ({
  authClient: (await import("./support/web-mocks.ts")).authClient,
}));
vi.mock("../src/lib/orpc.ts", async () => ({
  orpc: (await import("./support/web-mocks.ts")).orpc,
}));

/** Réglages de l'IA, états de la page et de la carte Anthropic (S-ai-settings §3, §4.1 à §4.5). */
beforeEach(() => {
  resetWebMocks();
  polyfillRadix();
  localStorage.clear();
  serveAiSettings("owner");
});

const body = () => document.body.textContent ?? "";

describe("chargement et erreur de list (§4.1)", () => {
  it("chargement : role=status aria-busy, « Chargement des réglages de l'IA… », titre déjà présent", async () => {
    procedures.llmCredentialList.mockReturnValue(new Promise(() => undefined));
    renderAiSettings();
    const label = await screen.findByText("Chargement des réglages de l'IA…");
    expect(label.closest("[role=status]")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("heading", { level: 2, name: "IA" })).toBeInTheDocument();
    expect(screen.queryByLabelText(KEY_FIELD)).not.toBeInTheDocument();
  });

  it("erreur : « Impossible de charger les réglages de l'IA », texte générique, Réessayer relance", async () => {
    procedures.llmCredentialList.mockRejectedValueOnce(apiError("INTERNAL"));
    renderAiSettings();
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Impossible de charger les réglages de l'IA");
    expect(alert).toHaveTextContent(
      "Une erreur est survenue. Vérifiez votre connexion puis réessayez.",
    );
    expect(alert.querySelector("svg[aria-hidden='true']")).not.toBeNull();
    procedures.llmCredentialList.mockResolvedValue({ items: [] });
    await userEvent.click(within(alert).getByRole("button", { name: "Réessayer" }));
    expect(await findNamed("heading", "Anthropic", { level: 2 })).toBeInTheDocument();
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("page : structure et politique d'envoi (§3)", () => {
  it("h2 « IA » (le h1 est celui de Réglages), introduction, une seule carte « Anthropic », aucune carte OpenAI ni Google", async () => {
    await openAiSettings([]);
    expect(screen.queryAllByRole("heading", { level: 1 })).toHaveLength(0);
    expect(screen.getByRole("heading", { level: 2, name: "IA" })).toBeInTheDocument();
    expect(
      screen.getByText(
        "Koklo utilise le compte d'IA de votre organisation pour le cadrage assisté. Vous fournissez votre propre clé : elle est facturée par le fournisseur, pas par Koklo.",
      ),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 2, name: "Anthropic" })).toHaveLength(1);
    expect(body()).not.toMatch(/OpenAI|Google/);
  });

  it.each([
    ["absente", []],
    ["configurée", [credential()]],
    ["invalide", [credential({ invalid: true, invalidatedAt: "2026-10-28T12:00:00.000Z" })]],
  ])(
    "état %s : le bloc d'envoi (InlineAlert + « Détails », TK-87) et la mention « chiffrée » sont toujours rendus",
    async (_n, items) => {
      await openAiSettings(items);
      const note = screen
        .getAllByRole("note")
        .find((n) =>
          n.textContent?.includes(
            "Votre texte est envoyé à l'agent IA avec la clé de l'organisation.",
          ),
        ) as HTMLElement;
      expect(note, "bloc d'envoi").toBeDefined();
      expect(note.textContent).not.toMatch(/Anthropic|États-Unis/);
      const toggle = within(note).getByRole("button", { name: "Détails" });
      expect(toggle).toHaveAttribute("aria-expanded", "false");
      await userEvent.click(toggle);
      expect(body()).toMatch(/Jamais envoyés : clés, identifiants de personnes/);
      expect(
        screen.getByText(
          "Votre clé est chiffrée sur nos serveurs. Elle ne peut plus être affichée, seulement remplacée ou retirée.",
        ),
      ).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Ce qui est envoyé/ })).not.toBeInTheDocument();
    },
  );

  it("le bloc de politique précède le formulaire dans le document (clé absente)", async () => {
    await openAiSettings([]);
    const policy = screen.getByText(
      "Votre texte est envoyé à l'agent IA avec la clé de l'organisation.",
    );
    expect(
      policy.compareDocumentPosition(keyField()) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("vocabulaire : jamais « jeton », « secret », « token », « BYOK » dans l'interface", async () => {
    await openAiSettings([]);
    expect(body()).not.toMatch(/jeton|secret|token|BYOK/i);
  });
});

describe("clé absente (§4.2)", () => {
  it("statut « Non configurée » (icône + texte), explication, formulaire visible d'emblée", async () => {
    await openAiSettings([]);
    const badge = screen.getByText("Non configurée");
    expect(badge.closest("[data-slot=badge]") ?? badge.parentElement).not.toBeNull();
    expect(
      (badge.parentElement as HTMLElement).querySelector("svg[aria-hidden='true']"),
    ).not.toBeNull();
    expect(
      screen.getByText(
        "Aucune clé n'est enregistrée. Le cadrage assisté ne fonctionnera pas tant qu'elle manque.",
      ),
    ).toBeInTheDocument();
    expect(keyField()).toBeVisible();
    expect(button(SAVE_VERIFY)).toBeEnabled();
    expect(queryButton(REMOVE)).not.toBeInTheDocument();
    expect(queryButton(VERIFY_AGAIN)).not.toBeInTheDocument();
    expect(queryButton(REPLACE)).not.toBeInTheDocument();
  });

  it("aide du champ, bloc « Avancé » replié (modèle par défaut facultatif), mention du quota", async () => {
    await openAiSettings([]);
    expect(
      screen.getByText(
        "Collez la clé depuis la console de votre compte Anthropic. Elle ne sera plus jamais affichée.",
      ),
    ).toBeInTheDocument();
    const advanced = screen.getByRole("button", { name: "Avancé" });
    expect(advanced).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(advanced);
    expect(advanced).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByLabelText("Modèle par défaut (facultatif)")).toBeInTheDocument();
    expect(
      screen.getByText("Laissez vide pour utiliser le modèle recommandé par Koklo."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Chaque vérification est comptée dans les limites de votre organisation (5 par heure).",
      ),
    ).toBeInTheDocument();
  });

  it("aucun bouton « afficher », « copier » ni masque de clé", async () => {
    await openAiSettings([]);
    expect(queryButton(/afficher|montrer|copier|voir la clé/i)).not.toBeInTheDocument();
    expect(body()).not.toMatch(/•|\*{4}/);
  });
});

describe("clé configurée (§3, §4.3)", () => {
  const configured = credential({
    defaultModel: "claude-sonnet-test",
    updatedAt: "2026-10-25T12:00:00.000Z",
    lastUsedAt: "2026-11-02T12:00:00.000Z",
  });

  it("statut « Configurée » (icône pleine + texte), lecture seule en dates longues et modèle en mono", async () => {
    await openAiSettings([configured]);
    expect(screen.getByText("Configurée", { exact: true })).toBeInTheDocument();
    expect(screen.getByText(/Enregistrée le 20 octobre 2026/)).toBeInTheDocument();
    expect(screen.getByText(/Modifiée le 25 octobre 2026/)).toBeInTheDocument();
    expect(screen.getByText(/Dernière utilisation : 2 novembre 2026/)).toBeInTheDocument();
    const model = screen.getByText("claude-sonnet-test");
    expect(model.className).toMatch(/font-mono/);
    expect(body()).toMatch(/Modèle par défaut : claude-sonnet-test/);
  });

  it("« Jamais utilisée » sans lastUsedAt ; pas de « Modifiée le » si updatedAt = createdAt", async () => {
    await openAiSettings([credential()]);
    expect(screen.getByText(/Jamais utilisée/)).toBeInTheDocument();
    expect(body()).not.toMatch(/Modifiée le/);
    expect(body()).not.toMatch(/Modèle par défaut :/);
  });

  it("jamais de « expirée », de vérification affirmée sans appel, ni de masque ou longueur de clé", async () => {
    await openAiSettings([configured]);
    expect(body()).not.toMatch(/expir/i);
    expect(body()).not.toMatch(/Vérifiée à l'instant/);
    expect(body()).not.toMatch(/•|\*{4}|caractères|se termine|finit par/i);
  });

  it("actions : Vérifier à nouveau, Remplacer la clé, Retirer la clé ; aucun champ de clé affiché", async () => {
    await openAiSettings([configured]);
    expect(button(VERIFY_AGAIN)).toBeEnabled();
    expect(button(REPLACE)).toBeEnabled();
    expect(button(REMOVE)).toBeEnabled();
    expect(queryKeyField()).not.toBeInTheDocument();
    expect(queryButton(SAVE_VERIFY)).not.toBeInTheDocument();
  });

  it("« Remplacer la clé » ouvre le formulaire, focus dans le champ ; « Annuler » le referme, focus sur « Remplacer la clé »", async () => {
    await openAiSettings([configured]);
    await userEvent.click(button(REPLACE));
    expect(keyField()).toHaveFocus();
    expect(keyField()).toHaveValue("");
    await userEvent.click(button("Annuler"));
    expect(queryKeyField()).not.toBeInTheDocument();
    expect(button(REPLACE)).toHaveFocus();
  });
});

describe("clé invalide (§4.4)", () => {
  const invalid = credential({ invalid: true, invalidatedAt: "2026-10-28T12:00:00.000Z" });

  it("statut « Refusée par le fournisseur (désactivée) » + date, icône warning, texte dédié", async () => {
    await openAiSettings([invalid]);
    expect(screen.getByText(/Refusée par le fournisseur \(désactivée\)/)).toBeInTheDocument();
    expect(body()).toMatch(/28 octobre 2026/);
    expect(
      screen.getByText(
        "Le fournisseur a refusé la clé de l'organisation. L'IA est désactivée jusqu'à ce que vous la remplaciez.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("Configurée", { exact: true })).not.toBeInTheDocument();
  });

  it("formulaire de remplacement ouvert d'emblée, « Retirer la clé » disponible, pas de « Vérifier à nouveau »", async () => {
    await openAiSettings([invalid]);
    expect(keyField()).toBeVisible();
    expect(button(SAVE_VERIFY)).toBeEnabled();
    expect(button(REMOVE)).toBeEnabled();
    expect(queryButton(VERIFY_AGAIN)).not.toBeInTheDocument();
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'un même écran, un test par comportement
describe("« Vérifier à nouveau » (§4.3, §4.6, §5)", () => {
  it("appelle verify seul (jamais set), annonce le modèle dans la région d'état unique", async () => {
    await openAiSettings([credential()]);
    await userEvent.click(button(VERIFY_AGAIN));
    expect(
      await screen.findByText(/Vérifiée à l'instant avec le modèle claude-test-1/),
    ).toBeInTheDocument();
    expect(procedures.llmCredentialVerify).toHaveBeenCalledTimes(1);
    expect(procedures.llmCredentialVerify.mock.calls[0]?.[0]).toEqual({ provider: "anthropic" });
    expect(procedures.llmCredentialSet).not.toHaveBeenCalled();
    expect(screen.getByText("Configurée", { exact: true })).toBeInTheDocument();
  });

  it("en cours : statut « Vérification en cours… », boutons de la carte désactivés, role=status", async () => {
    procedures.llmCredentialVerify.mockReturnValue(new Promise(() => undefined));
    await openAiSettings([credential()]);
    await userEvent.click(button(VERIFY_AGAIN));
    expect(await screen.findAllByText(/Vérification en cours…/)).not.toHaveLength(0);
    expect(statusText()).toMatch(/Vérification/);
    for (const name of [REPLACE, REMOVE]) expect(button(name)).toBeDisabled();
    expect(button(/Vérification/)).toHaveAttribute("aria-busy", "true");
  });

  it("double clic : un seul verify", async () => {
    procedures.llmCredentialVerify.mockReturnValue(new Promise(() => undefined));
    await openAiSettings([credential()]);
    await userEvent.dblClick(button(VERIFY_AGAIN));
    expect(procedures.llmCredentialVerify).toHaveBeenCalledTimes(1);
  });

  it("409 undecryptable : statut « Illisible : à saisir à nouveau », formulaire ouvert, Retirer disponible", async () => {
    procedures.llmCredentialVerify.mockRejectedValue(
      apiError("LLM_NOT_CONFIGURED", { reason: "undecryptable" }),
    );
    await openAiSettings([credential()]);
    await userEvent.click(button(VERIFY_AGAIN));
    expect(await screen.findByText(/Illisible : à saisir à nouveau/)).toBeInTheDocument();
    expect(
      screen.getByText(
        "La clé enregistrée ne peut plus être lue. Saisissez-la de nouveau pour la remplacer.",
      ),
    ).toBeInTheDocument();
    expect(keyField()).toBeVisible();
    expect(button(REMOVE)).toBeEnabled();
  });

  it("409 invalidated : traité comme une clé invalide (formulaire ouvert, plus de « Vérifier à nouveau »)", async () => {
    procedures.llmCredentialVerify.mockRejectedValue(
      apiError("LLM_NOT_CONFIGURED", { reason: "invalidated" }),
    );
    await openAiSettings([credential()]);
    await userEvent.click(button(VERIFY_AGAIN));
    expect(
      await screen.findByText(/Refusée par le fournisseur \(désactivée\)/),
    ).toBeInTheDocument();
    expect(keyField()).toBeVisible();
    expect(queryButton(VERIFY_AGAIN)).not.toBeInTheDocument();
  });

  it("409 missing : la carte repasse à « Clé absente » et la liste est rechargée", async () => {
    procedures.llmCredentialVerify.mockRejectedValue(
      apiError("LLM_NOT_CONFIGURED", { reason: "missing" }),
    );
    await openAiSettings([credential()]);
    procedures.llmCredentialList.mockResolvedValue({ items: [] });
    const before = procedures.llmCredentialList.mock.calls.length;
    await userEvent.click(button(VERIFY_AGAIN));
    expect(await screen.findByText("Non configurée")).toBeInTheDocument();
    expect(procedures.llmCredentialList.mock.calls.length).toBeGreaterThan(before);
  });
});

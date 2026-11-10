import type { CreationErrorCode, CreationStatus } from "@koklo/contract";
import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CreationCard } from "../src/components/creation-card.tsx";
import {
  INSTALL_ID_1,
  INSTALL_ID_2,
  installation,
  START_REPLY,
} from "./support/github-fixtures.ts";
import { renderWithQuery } from "./support/render.tsx";
import {
  apiError,
  polyfillRadix,
  procedures,
  projectCard,
  resetWebMocks,
  setUrl,
  watchUrl,
} from "./support/web-mocks.ts";

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
const redirect = vi.hoisted(() => ({ assignLocation: vi.fn() }));
vi.mock("../src/lib/github-redirect.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/lib/github-redirect.ts")>()),
  assignLocation: redirect.assignLocation,
}));

const ID = "7d1f6c1e-0b0a-4c55-9d63-1d2f7d6a1b09";

const steps = (
  repo: CreationStatus["steps"][number]["status"],
  extra: CreationStatus["steps"] = [],
) =>
  [
    { key: "project", status: "done" },
    { key: "idea", status: "done" },
    ...extra,
    { key: "repo", status: repo },
  ] as CreationStatus["steps"];

const running = (over: Partial<CreationStatus> = {}): CreationStatus => ({
  status: "running",
  steps: steps("running"),
  ideaPages: 10,
  canAct: true,
  ...over,
});

const failed = (
  code: CreationErrorCode,
  extra: object = {},
  over: Partial<CreationStatus> = {},
): CreationStatus => ({
  status: code === "no_account" ? "skipped" : "failed",
  steps: steps(code === "no_account" ? "todo" : "error"),
  ideaPages: 10,
  error: { code, ...extra },
  canAct: true,
  ...over,
});

function renderCard(creation: CreationStatus) {
  const card = projectCard({ id: ID, name: "Atelier neuf", initials: "AN", creation });
  procedures.projectCreationStatus.mockResolvedValue(creation);
  return renderWithQuery(<CreationCard card={card as never} />);
}

const region = () => screen.getByRole("status");

beforeEach(() => {
  resetWebMocks();
  polyfillRadix();
  watchUrl();
  setUrl("/projects");
  procedures.installationList.mockResolvedValue([
    installation({ id: INSTALL_ID_1, ownerLogin: "acme-corp" }),
  ]);
  procedures.projectRetryRepo.mockResolvedValue(running());
});

afterEach(() => vi.useRealTimers());

describe("Carte de création : avancement", () => {
  it("en cours : région d'état, étapes écrites, phrase, lien « Ouvrir le projet »", () => {
    renderCard(running());
    expect(region()).toHaveTextContent("Atelier neuf");
    const items = within(region()).getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual([
      "Projet créé (terminé)",
      "Dossier d'idée prêt (10 pages) (terminé)",
      "Création du dépôt de spec sur GitHub… (en cours)",
    ]);
    expect(region()).toHaveTextContent("Vous pouvez déjà ouvrir le projet et écrire l'idée.");
    expect(within(region()).getByRole("link", { name: /Ouvrir le projet/ })).toHaveAttribute(
      "href",
      `/projects/${ID}`,
    );
    expect(within(region()).queryByRole("button")).not.toBeInTheDocument();
  });

  it("dossier vide : 4 pages ; client invité : « Invitation envoyée au client »", () => {
    renderCard(
      running({ ideaPages: 4, steps: steps("running", [{ key: "invitation", status: "done" }]) }),
    );
    expect(region()).toHaveTextContent("Dossier d'idée prêt (4 pages)");
    expect(region()).toHaveTextContent("Invitation envoyée au client");
  });

  it("invitation en échec : phrase et lien vers les membres (owner/admin)", () => {
    renderCard(running({ steps: steps("running", [{ key: "invitation", status: "error" }]) }));
    expect(region()).toHaveTextContent(
      "L'invitation n'a pas pu être envoyée. Invitez le client depuis Réglages > Membres.",
    );
    expect(within(region()).getByRole("link", { name: "Ouvrir les membres" })).toHaveAttribute(
      "href",
      "/settings/members",
    );
  });
});

describe("Carte de création : sondage", () => {
  it("relit l'état toutes les 3 s tant que c'est en cours, puis s'arrête à la fin", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderCard(running());
    procedures.projectCreationStatus.mockResolvedValue(running());
    await vi.advanceTimersByTimeAsync(3100);
    expect(procedures.projectCreationStatus).toHaveBeenCalledTimes(1);
    expect(procedures.projectCreationStatus.mock.calls[0]?.[0]).toEqual({ projectId: ID });
    await vi.advanceTimersByTimeAsync(3000);
    expect(procedures.projectCreationStatus).toHaveBeenCalledTimes(2);
    procedures.projectCreationStatus.mockResolvedValue({
      status: "succeeded",
      steps: steps("done"),
      ideaPages: 10,
      canAct: true,
    });
    await vi.advanceTimersByTimeAsync(3000);
    expect(procedures.projectCreationStatus).toHaveBeenCalledTimes(3);
    await waitFor(() => expect(region()).toHaveTextContent("Dépôt de spec créé"));
    await vi.advanceTimersByTimeAsync(15_000);
    expect(procedures.projectCreationStatus).toHaveBeenCalledTimes(3);
  });

  it("un échec arrête aussi le sondage", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderCard(running());
    procedures.projectCreationStatus.mockResolvedValue(failed("unknown"));
    await vi.advanceTimersByTimeAsync(3100);
    await waitFor(() =>
      expect(region()).toHaveTextContent("Le dépôt de spec n'a pas pu être créé"),
    );
    const calls = procedures.projectCreationStatus.mock.calls.length;
    await vi.advanceTimersByTimeAsync(12_000);
    expect(procedures.projectCreationStatus).toHaveBeenCalledTimes(calls);
  });

  it("reprise après rechargement : une carte en échec repart de l'état serveur, sans sondage", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderCard(failed("provider_unavailable"));
    expect(region()).toHaveTextContent("GitHub ne répond pas.");
    await vi.advanceTimersByTimeAsync(10_000);
    expect(procedures.projectCreationStatus).not.toHaveBeenCalled();
  });
});

/** Un cas par code d'échec de S-projects v7 §4.2 : phrase de la carte et boutons proposés (owner/admin). */
const FAILURES: [CreationErrorCode, object, string, string[]][] = [
  [
    "no_account",
    {},
    "Aucun compte GitHub n'est relié. Le dépôt de spec attendra que vous installiez l'application.",
    ["Relier GitHub", "Réessayer"],
  ],
  [
    "name_taken",
    { repoName: "atelier-spec", ownerLogin: "acme-corp" },
    "Le nom « atelier-spec » est déjà pris sur acme-corp.",
    ["Réessayer"],
  ],
  [
    "user_token_required",
    { ownerLogin: "acme-corp" },
    "Koklo a besoin de votre autorisation GitHub pour créer ce dépôt.",
    ["Autoriser Koklo"],
  ],
  [
    "auth_expired_user",
    { ownerLogin: "acme-corp" },
    "L'autorisation GitHub a expiré.",
    ["Réautoriser Koklo"],
  ],
  [
    "auth_expired_installation",
    {},
    "L'accès de Koklo à ce compte GitHub a expiré. Réinstallez l'application depuis la page GitHub.",
    ["Ouvrir la page GitHub", "Réessayer"],
  ],
  [
    "resource_not_accessible",
    { ownerLogin: "acme-corp" },
    "GitHub refuse la création d'un dépôt sur acme-corp.",
    ["Réessayer"],
  ],
  [
    "provider_unavailable",
    {},
    "GitHub ne répond pas. Votre projet est enregistré ; réessayez plus tard.",
    ["Réessayer"],
  ],
  [
    "rate_limited",
    { retryAfterMs: 2000 },
    "GitHub limite temporairement les demandes. Réessayez dans environ 2 secondes.",
    ["Réessayer"],
  ],
  [
    "account_unavailable",
    {},
    "Ce compte GitHub n'est plus disponible. Choisissez-en un autre.",
    ["Réessayer"],
  ],
  ["invalid_name", { repoName: "x y" }, "Le nom du dépôt n'est pas accepté.", ["Réessayer"]],
  [
    "forbidden",
    {},
    "Vous n'avez plus le droit de créer un dépôt. Demandez à un propriétaire ou à un administrateur.",
    [],
  ],
  ["unknown", {}, "Le dépôt de spec n'a pas pu être créé. Une erreur est survenue.", ["Réessayer"]],
];

describe("Carte de création : les 12 échecs", () => {
  it.each(FAILURES)("%s : phrase et actions", (code, extra, text, buttons) => {
    renderCard(failed(code, extra));
    const card = region();
    expect(card).toHaveTextContent(text);
    const names = [
      ...within(card)
        .queryAllByRole("button")
        .map((b) => b.textContent),
      ...within(card)
        .queryAllByRole("link")
        .map((a) => a.textContent),
    ].filter((name) => name && !name.startsWith("Ouvrir le projet"));
    expect(names.sort()).toEqual([...buttons].sort());
    expect(card).not.toHaveTextContent(/jeton|token|oauth|repository/i);
  });

  it("projet utilisable dans tous les cas : le lien « Ouvrir le projet » reste", () => {
    renderCard(failed("forbidden"));
    expect(within(region()).getByRole("link", { name: /Ouvrir le projet/ })).toBeInTheDocument();
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par action
describe("Carte de création : actions", () => {
  it("« Réessayer » : project.retryRepo avec le projet, jamais désactivé par une minuterie", async () => {
    renderCard(failed("provider_unavailable"));
    await userEvent.click(within(region()).getByRole("button", { name: "Réessayer" }));
    await waitFor(() => expect(procedures.projectRetryRepo).toHaveBeenCalledTimes(1));
    expect(procedures.projectRetryRepo.mock.calls[0]?.[0]).toEqual({ projectId: ID });
    expect(within(region()).getByRole("button", { name: "Réessayer" })).toBeEnabled();
    await userEvent.click(within(region()).getByRole("button", { name: "Réessayer" }));
    await waitFor(() => expect(procedures.projectRetryRepo).toHaveBeenCalledTimes(2));
  });

  it("refus 409 (déjà en cours) : l'état est relu, aucune erreur affichée", async () => {
    procedures.projectRetryRepo.mockRejectedValue(
      apiError("CONFLICT", { reason: "creation_running" }),
    );
    renderCard(failed("unknown"));
    await userEvent.click(within(region()).getByRole("button", { name: "Réessayer" }));
    await waitFor(() => expect(procedures.projectRetryRepo).toHaveBeenCalled());
    await waitFor(() => expect(procedures.projectCreationStatus).toHaveBeenCalled());
    expect(region()).not.toHaveTextContent("Une erreur est survenue. Réessayez dans un instant.");
  });

  it("autre erreur : message sous la carte, bouton toujours disponible", async () => {
    procedures.projectRetryRepo.mockRejectedValue(apiError("INTERNAL"));
    renderCard(failed("unknown"));
    await userEvent.click(within(region()).getByRole("button", { name: "Réessayer" }));
    expect(
      await within(region()).findByText("Une erreur est survenue. Réessayez dans un instant."),
    ).toBeInTheDocument();
    expect(within(region()).getByRole("button", { name: "Réessayer" })).toBeEnabled();
  });

  it("nom pris : champ « Choisir un autre nom » prérempli, puis project.retryRepo avec le nouveau nom", async () => {
    renderCard(failed("name_taken", { repoName: "atelier-spec", ownerLogin: "acme-corp" }));
    const field = within(region()).getByLabelText("Choisir un autre nom");
    expect(field).toHaveValue("atelier-spec");
    await userEvent.clear(field);
    await userEvent.type(field, "atelier-neuf-spec");
    await userEvent.click(within(region()).getByRole("button", { name: "Réessayer" }));
    await waitFor(() => expect(procedures.projectRetryRepo).toHaveBeenCalled());
    expect(procedures.projectRetryRepo.mock.calls[0]?.[0]).toEqual({
      projectId: ID,
      repoName: "atelier-neuf-spec",
    });
  });

  it("nom invalide : message sous le champ, aucun appel tant que le nom reste invalide", async () => {
    renderCard(failed("invalid_name", { repoName: "x y" }));
    const field = within(region()).getByLabelText("Choisir un autre nom");
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(region()).toHaveTextContent("Utilisez uniquement des lettres, chiffres");
    await userEvent.click(within(region()).getByRole("button", { name: "Réessayer" }));
    expect(procedures.projectRetryRepo).not.toHaveBeenCalled();
  });

  it("compte indisponible : sélecteur de compte puis « Réessayer » avec le compte choisi", async () => {
    procedures.installationList.mockResolvedValue([
      installation({ id: INSTALL_ID_1, ownerLogin: "acme-corp" }),
      installation({ id: INSTALL_ID_2, ownerLogin: "jdoe", ownerKind: "user" }),
    ]);
    renderCard(failed("account_unavailable"));
    const retry = within(region()).getByRole("button", { name: "Réessayer" });
    expect(retry).toBeDisabled();
    await userEvent.click(
      within(region()).getByRole("combobox", { name: "Compte GitHub du dépôt de spec" }),
    );
    await userEvent.click(await screen.findByRole("option", { name: "jdoe" }));
    await userEvent.click(retry);
    await waitFor(() => expect(procedures.projectRetryRepo).toHaveBeenCalled());
    expect(procedures.projectRetryRepo.mock.calls[0]?.[0]).toEqual({
      projectId: ID,
      installationId: INSTALL_ID_2,
    });
  });

  it("« Autoriser Koklo » : lance l'autorisation du compte concerné et quitte vers GitHub", async () => {
    procedures.installationStart.mockResolvedValue(START_REPLY);
    renderCard(failed("user_token_required", { ownerLogin: "acme-corp" }));
    const button = within(region()).getByRole("button", { name: "Autoriser Koklo" });
    await waitFor(() => expect(procedures.installationList).toHaveBeenCalled());
    await userEvent.click(button);
    await waitFor(() => expect(procedures.installationStart).toHaveBeenCalled());
    expect(procedures.installationStart.mock.calls[0]?.[0]).toEqual({
      installationId: INSTALL_ID_1,
    });
    await waitFor(() => expect(redirect.assignLocation).toHaveBeenCalledWith(START_REPLY.url));
  });

  it("« Relier GitHub » et « Ouvrir la page GitHub » mènent aux réglages GitHub", () => {
    renderCard(failed("no_account"));
    expect(within(region()).getByRole("link", { name: "Relier GitHub" })).toHaveAttribute(
      "href",
      "/settings/github",
    );
  });

  it("sans droit d'agir : aucune action, « Demandez à un propriétaire ou à un administrateur. »", () => {
    renderCard(failed("user_token_required", { ownerLogin: "acme-corp" }, { canAct: false }));
    expect(within(region()).queryByRole("button")).not.toBeInTheDocument();
    expect(region()).toHaveTextContent("Demandez à un propriétaire ou à un administrateur.");
  });
});

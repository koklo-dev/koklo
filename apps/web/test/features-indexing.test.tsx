import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CLIENT_SIDE,
  FEATURES,
  findTable,
  GIT_VOCABULARY,
  head,
  inputsOf,
  PROJECT_ID,
  renderFeatures,
  serve,
  statusRegion,
  visibleText,
} from "./support/features.tsx";
import {
  apiError,
  polyfillRadix,
  procedures,
  resetWebMocks,
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

/**
 * TK-48 / 48d, indexation de la spec : absence (spec.head null) qualifiée par repo.list selon le rôle,
 * en préparation, index en échec (design/screens/S-features.md §4.5 à §4.8).
 */
const SPEC_REPO = {
  id: "01900000-0000-7000-8000-0000000000f1",
  projectId: PROJECT_ID,
  installationId: "01900000-0000-7000-8000-0000000000e1",
  role: "spec",
  mode: "new",
  ownerLogin: "acme-corp",
  name: "alpha-spec",
  defaultBranch: "main",
  specPath: ".koklo",
};
const CODE_REPO = {
  ...SPEC_REPO,
  id: "01900000-0000-7000-8000-0000000000f2",
  role: "code",
  specPath: null,
};

const NO_REPO_TITLE = "Ce projet n'a pas de dépôt de spec";
const NEUTRAL_TITLE = "Aucune fonctionnalité à afficher pour le moment";
const PREPARING_TITLE = "La spec est en cours de préparation";
const FAILED_TITLE = "La spec n'a pas pu être lue";
const TOO_LARGE = "La spec de ce projet est trop volumineuse pour être lue par Koklo.";
const CORRUPT = "La spec de ce projet contient un problème qui empêche sa lecture.";

beforeEach(() => {
  resetWebMocks();
  polyfillRadix();
  watchUrl();
  serve();
  procedures.specHead.mockResolvedValue(null);
});

const reject = (code: string, data?: unknown) => () => Promise.reject(apiError(code, data));
const heading = (name: string) => screen.findByRole("heading", { name });

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("Projet sans dépôt de spec (§4.6) — spec.head null et repo.list sans dépôt de spec", () => {
  it.each(["owner", "admin"] as const)(
    "%s : titre, texte, bouton « Créer le dépôt de spec »",
    async (role) => {
      serve(role);
      procedures.specHead.mockResolvedValue(null);
      renderFeatures();
      expect(await heading(NO_REPO_TITLE)).toBeVisible();
      expect(visibleText()).toContain(
        "Sans dépôt de spec, Koklo ne peut pas afficher ni enregistrer les fonctionnalités. Créez-le maintenant : il sera privé et lié à ce projet.",
      );
      expect(screen.getByRole("button", { name: "Créer le dépôt de spec" })).toBeEnabled();
      expect(inputsOf(procedures.repoList)[0]).toMatchObject({ projectId: PROJECT_ID });
      expect(procedures.specListFeatures).not.toHaveBeenCalled();
      expect(screen.queryByRole("table")).not.toBeInTheDocument();
      expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    },
  );

  it.each(["dev", "designer"] as const)("%s : texte seul, aucun bouton", async (role) => {
    serve(role);
    procedures.specHead.mockResolvedValue(null);
    renderFeatures();
    expect(await heading(NO_REPO_TITLE)).toBeVisible();
    expect(visibleText()).toContain(
      "Ce projet n'a pas encore de dépôt de spec. Un propriétaire ou un administrateur peut le créer.",
    );
    expect(screen.queryByRole("button", { name: /dépôt de spec/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(procedures.repoList).toHaveBeenCalled();
  });

  it("un dépôt d'un autre rôle que « spec » ne compte pas : toujours « sans dépôt de spec »", async () => {
    procedures.repoList.mockResolvedValue([CODE_REPO]);
    renderFeatures();
    expect(await heading(NO_REPO_TITLE)).toBeVisible();
  });

  it("pendant la lecture de repo.list : état de chargement, jamais une affirmation prématurée", async () => {
    procedures.repoList.mockImplementation(() => new Promise(() => undefined));
    renderFeatures();
    await screen.findByRole("status");
    expect(screen.getByRole("status")).toHaveTextContent("Chargement des fonctionnalités…");
    expect(screen.queryByRole("heading", { name: NO_REPO_TITLE })).not.toBeInTheDocument();
  });

  it("le rôle inconnu (organisation pas encore chargée) n'affirme rien et n'appelle pas repo.list", async () => {
    procedures.organizationList.mockImplementation(() => new Promise(() => undefined));
    renderFeatures();
    await screen.findByRole("status");
    await waitFor(() => expect(procedures.specHead).toHaveBeenCalled());
    expect(procedures.repoList).not.toHaveBeenCalled();
    expect(screen.queryByRole("heading", { name: NO_REPO_TITLE })).not.toBeInTheDocument();
  });

  it("repo.list en erreur : état neutre (jamais « sans dépôt ») avec « Réessayer » qui relit repo.list", async () => {
    procedures.repoList.mockImplementationOnce(reject("INTERNAL")).mockResolvedValue([]);
    renderFeatures();
    expect(await heading(NEUTRAL_TITLE)).toBeVisible();
    expect(screen.queryByRole("heading", { name: NO_REPO_TITLE })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    expect(await heading(NO_REPO_TITLE)).toBeVisible();
    expect(procedures.repoList).toHaveBeenCalledTimes(2);
  });
});

describe("Spec indisponible, rôle sans détail (§4.7) — client, business", () => {
  it.each(CLIENT_SIDE)(
    "%s : état neutre, texte du produit, AUCUN appel à repo.list",
    async (role) => {
      serve(role);
      procedures.specHead.mockResolvedValue(null);
      renderFeatures();
      expect(await heading(NEUTRAL_TITLE)).toBeVisible();
      expect(visibleText()).toContain(
        "La spec de ce projet n'est pas encore disponible. Revenez plus tard ou demandez à l'équipe où en est la préparation.",
      );
      expect(screen.getByRole("button", { name: "Actualiser" })).toBeEnabled();
      expect(procedures.repoList).not.toHaveBeenCalled();
      expect(visibleText()).not.toMatch(GIT_VOCABULARY);
      expect(screen.queryByRole("heading", { name: NO_REPO_TITLE })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Créer le dépôt/ })).not.toBeInTheDocument();
    },
  );

  it("« Actualiser » relit spec.head", async () => {
    serve("client");
    procedures.specHead.mockResolvedValue(null);
    renderFeatures();
    await heading(NEUTRAL_TITLE);
    await userEvent.click(screen.getByRole("button", { name: "Actualiser" }));
    await waitFor(() => expect(procedures.specHead).toHaveBeenCalledTimes(2));
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("Spec en préparation (§4.5)", () => {
  const expectPreparing = async () => {
    expect(await heading(PREPARING_TITLE)).toBeVisible();
    expect(visibleText()).toContain(
      "Koklo lit le dépôt de spec de ce projet. Les fonctionnalités s'afficheront dès que la lecture sera terminée.",
    );
    expect(screen.getByRole("button", { name: "Actualiser" })).toBeEnabled();
    expect(statusRegion()).toHaveTextContent("Préparation de la spec en cours.");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  };

  it("spec.head « building » sans élément : carte « en cours de préparation »", async () => {
    procedures.specHead.mockResolvedValue(head({ status: "building" }));
    procedures.specListFeatures.mockResolvedValue({ items: [], nextCursor: null });
    renderFeatures();
    await expectPreparing();
  });

  it.each(["owner", "admin", "dev", "designer"] as const)(
    "spec.head null avec un dépôt de spec dans repo.list (%s) : même carte",
    async (role) => {
      serve(role);
      procedures.specHead.mockResolvedValue(null);
      procedures.repoList.mockResolvedValue([SPEC_REPO]);
      renderFeatures();
      await expectPreparing();
      expect(
        screen.queryByRole("button", { name: "Créer le dépôt de spec" }),
      ).not.toBeInTheDocument();
    },
  );

  it.each(CLIENT_SIDE)("%s : « building » = même carte, vocabulaire sans git", async (role) => {
    serve(role);
    procedures.specHead.mockResolvedValue(head({ status: "building" }));
    procedures.specListFeatures.mockResolvedValue({ items: [], nextCursor: null });
    renderFeatures();
    await expectPreparing();
    expect(visibleText()).not.toMatch(/commit|branche|SHA|indexation|index\b/i);
  });

  it("« Actualiser » relit spec.head et annonce « La spec est prête. » quand la liste arrive", async () => {
    procedures.specHead
      .mockResolvedValueOnce(head({ status: "building" }))
      .mockResolvedValue(head({ status: "ready" }));
    procedures.specListFeatures
      .mockResolvedValueOnce({ items: [], nextCursor: null })
      .mockResolvedValue({
        items: FEATURES,
        nextCursor: null,
      });
    renderFeatures();
    await heading(PREPARING_TITLE);
    await userEvent.click(screen.getByRole("button", { name: "Actualiser" }));
    await findTable();
    expect(screen.queryByRole("heading", { name: PREPARING_TITLE })).not.toBeInTheDocument();
    expect(statusRegion()).toHaveTextContent("La spec est prête.");
  });

  it("« building » avec déjà des éléments : la liste s'affiche avec une alerte neutre au-dessus", async () => {
    procedures.specHead.mockResolvedValue(head({ status: "building" }));
    renderFeatures();
    const table = await findTable();
    const notice = screen.getByText(
      "La spec est en cours de mise à jour : la liste peut être incomplète.",
    );
    expect(notice.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByRole("heading", { name: PREPARING_TITLE })).not.toBeInTheDocument();
    expect(notice.closest("[role='alert']")).toBeNull();
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("Index en échec (§4.8)", () => {
  const failed = (errorCode: string | null = "spec_too_large") =>
    head({ status: "failed", errorCode });

  it("spec.head « failed » : alerte destructive, listFeatures JAMAIS appelé", async () => {
    procedures.specHead.mockResolvedValue(failed());
    renderFeatures();
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(FAILED_TITLE);
    expect(alert).toHaveTextContent(TOO_LARGE);
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(alert.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    expect(procedures.specListFeatures).not.toHaveBeenCalled();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it.each(["owner", "admin", "dev", "designer"] as const)(
    "%s : consigne de correction et ligne technique « Code : … · version … » en mono",
    async (role) => {
      serve(role);
      procedures.specHead.mockResolvedValue(failed());
      renderFeatures();
      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent(
        "Corrigez la spec puis poussez la correction : la lecture reprendra seule.",
      );
      const technical = within(alert).getByText(/Code : spec_too_large · version a1b2c3d/);
      expect(technical.className).toMatch(/font-mono/);
    },
  );

  it.each(CLIENT_SIDE)(
    "%s : « Prévenez l'équipe », ni code, ni version, ni consigne technique",
    async (role) => {
      serve(role);
      procedures.specHead.mockResolvedValue(failed());
      renderFeatures();
      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent("Prévenez l'équipe : la spec doit être corrigée.");
      expect(alert).toHaveTextContent(TOO_LARGE);
      expect(visibleText()).not.toMatch(GIT_VOCABULARY);
      expect(visibleText()).not.toMatch(/Code :|poussez|Corrigez la spec/);
    },
  );

  it("errorCode inconnu : phrase générique ; pour le client la valeur brute n'apparaît nulle part", async () => {
    serve("client");
    procedures.specHead.mockResolvedValue(failed("yaml_boom_42"));
    renderFeatures();
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(CORRUPT);
    expect(visibleText()).not.toContain("yaml_boom_42");
  });

  it("errorCode inconnu côté équipe : la phrase reste générique (la valeur n'est que dans la ligne technique)", async () => {
    procedures.specHead.mockResolvedValue(failed("yaml_boom_42"));
    renderFeatures();
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(CORRUPT);
    const sentences = alert.querySelectorAll("p");
    for (const p of sentences) {
      if (!/Code :/.test(p.textContent ?? "")) expect(p.textContent).not.toContain("yaml_boom_42");
    }
  });

  it("listFeatures répond 409 SPEC_INDEX_FAILED : même rendu, code et version lus dans l'erreur", async () => {
    procedures.specListFeatures.mockImplementation(
      reject("SPEC_INDEX_FAILED", { errorCode: "spec_too_large", commitSha: "b".repeat(40) }),
    );
    renderFeatures();
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(FAILED_TITLE);
    expect(alert).toHaveTextContent(TOO_LARGE);
    expect(alert).toHaveTextContent("Code : spec_too_large · version bbbbbbb");
  });

  it("« Actualiser » relit spec.head (pas de repli sur une autre révision) et la liste revient une fois corrigée", async () => {
    procedures.specHead.mockResolvedValueOnce(failed()).mockResolvedValue(head());
    renderFeatures();
    const alert = await screen.findByRole("alert");
    await userEvent.click(within(alert).getByRole("button", { name: "Actualiser" }));
    await findTable();
    expect(procedures.specHead).toHaveBeenCalledTimes(2);
    for (const input of inputsOf(procedures.specHead)) {
      expect(input).not.toHaveProperty("branch");
      expect(input).not.toHaveProperty("commitSha");
    }
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

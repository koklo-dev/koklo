import { waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CLIENT_SIDE,
  DETAIL,
  findTable,
  GIT_VOCABULARY,
  head,
  inputsOf,
  renderFeatures,
  serve,
  TEAM,
  titleLink,
  visibleText,
} from "./support/features.tsx";
import { findRole } from "./support/wait.ts";
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
 * TK-48 / 48d, AC-48-28 : la vue client / business ne croise jamais de vocabulaire git (commit, branche, SHA,
 * chemin de fichier, code d'erreur technique), ni les tables, endpoints et exigences non fonctionnelles.
 * Contrôles sur le DOM entier (texte ET attributs), avec une vue équipe de contrôle pour éviter un faux vert.
 */
beforeEach(() => {
  resetWebMocks();
  polyfillRadix();
  watchUrl();
  serve();
});

const TECHNICAL_VALUE =
  /a1b2c3d|a1b2c3d4e5f6|\.ya?ml|\.koklo|features\/F-|spec_too_large|SPEC_INDEX_FAILED|PROVIDER_/i;

/** Texte visible + valeurs de tous les attributs (aria-label, title, href, alt, data-*). */
function everythingVisible(): string {
  const attributes = Array.from(document.body.querySelectorAll("*")).flatMap((element) =>
    Array.from(element.attributes)
      .filter((attribute) => !["class", "style"].includes(attribute.name))
      .map((attribute) => attribute.value),
  );
  return [visibleText(), ...attributes].join(" | ");
}

async function openFiche(role: (typeof CLIENT_SIDE)[number] | (typeof TEAM)[number]) {
  serve(role);
  renderFeatures({ search: "?feature=F-001" });
  const dialog = await findRole("dialog");
  await within(dialog).findByText("Description");
  return dialog;
}

describe("Vue client / business — liste", () => {
  it.each(CLIENT_SIDE)(
    "%s : ni version, ni chemin, ni SHA, ni terme git, dans le texte comme dans les attributs",
    async (role) => {
      serve(role);
      renderFeatures();
      await findTable();
      expect(everythingVisible()).not.toMatch(GIT_VOCABULARY);
      expect(everythingVisible()).not.toMatch(TECHNICAL_VALUE);
      expect(visibleText()).toContain("Mise à jour le");
    },
  );

  it("contrôle : la vue équipe affiche bien la version (le test client n'est pas vacuous)", async () => {
    serve("dev");
    renderFeatures();
    await findTable();
    expect(everythingVisible()).toMatch(/a1b2c3d/);
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("Vue client / business — fiche", () => {
  it.each(CLIENT_SIDE)(
    "%s : description, critères, Écrans / Rôles / Règles seulement",
    async (role) => {
      const dialog = await openFiche(role);
      expect(within(dialog).getByText("Première ligne.", { exact: false })).toBeInTheDocument();
      expect(within(dialog).getByText("Connexion réussie")).toBeInTheDocument();
      expect(within(dialog).getByText("Étant donné")).toBeInTheDocument();
      for (const [group, value] of [
        ["Écrans", "S-login"],
        ["Rôles", "RL-owner"],
        ["Règles", "R-001"],
      ]) {
        expect(within(dialog).getByText(group as string)).toBeInTheDocument();
        expect(within(dialog).getByText(value as string)).toBeInTheDocument();
      }
    },
  );

  it.each(CLIENT_SIDE)(
    "%s : AUCUNE table, endpoint ni exigence non fonctionnelle (titres et valeurs)",
    async (role) => {
      const dialog = await openFiche(role);
      for (const absent of [
        "Tables",
        "Endpoints",
        "Exigences non fonctionnelles",
        "T-user",
        "E-login",
        "NFR-latence",
      ]) {
        expect(within(dialog).queryByText(absent)).not.toBeInTheDocument();
      }
    },
  );

  it.each(CLIENT_SIDE)(
    "%s : AC-48-28, aucun vocabulaire git ni valeur technique dans tout le DOM",
    async (role) => {
      await openFiche(role);
      expect(everythingVisible()).not.toMatch(GIT_VOCABULARY);
      expect(everythingVisible()).not.toMatch(TECHNICAL_VALUE);
      expect(everythingVisible()).not.toMatch(/T-user|E-login|NFR-latence/);
    },
  );

  it.each(CLIENT_SIDE)(
    "%s : pas de pied « Version de la spec » ni de ligne « Fichier »",
    async (role) => {
      const dialog = await openFiche(role);
      expect(within(dialog).queryByText("Fichier")).not.toBeInTheDocument();
      expect(within(dialog).queryByLabelText(/Version de la spec/)).not.toBeInTheDocument();
      expect(visibleText(dialog)).not.toContain("Version de la spec");
    },
  );

  it.each(TEAM)(
    "contrôle : %s voit tables, endpoints, exigences, version et fichier",
    async (role) => {
      const dialog = await openFiche(role);
      for (const present of [
        "Tables",
        "T-user",
        "Endpoints",
        "E-login",
        "Exigences non fonctionnelles",
        "NFR-latence",
        "Fichier",
      ]) {
        expect(within(dialog).getByText(present)).toBeInTheDocument();
      }
      expect(within(dialog).getByLabelText(/Version de la spec a1b2c3d/)).toBeInTheDocument();
    },
  );
});

describe("Vue client / business — erreurs sans terme technique", () => {
  const failures: Array<[string, unknown]> = [
    [
      "SPEC_INDEX_FAILED",
      apiError("SPEC_INDEX_FAILED", { errorCode: "spec_too_large", commitSha: "b".repeat(40) }),
    ],
    ["PROVIDER_UNAVAILABLE", apiError("PROVIDER_UNAVAILABLE")],
    ["PROVIDER_RATE_LIMITED", apiError("PROVIDER_RATE_LIMITED", { retryAfterMs: 3000 })],
    [
      "PROVIDER_AUTH_EXPIRED",
      apiError("PROVIDER_AUTH_EXPIRED", { kind: "installation", refreshable: false }),
    ],
    ["NOT_FOUND", apiError("NOT_FOUND")],
    ["INTERNAL", apiError("INTERNAL")],
  ];

  it.each(failures)(
    "fiche en erreur %s : aucun code, SHA ni lien GitHub pour le client",
    async (_code, error) => {
      serve("client");
      procedures.specGetFeature.mockRejectedValue(error);
      renderFeatures({ search: "?feature=F-001" });
      const dialog = await findRole("dialog");
      await findRole("alert", { from: dialog });
      expect(everythingVisible()).not.toMatch(TECHNICAL_VALUE);
      expect(everythingVisible()).not.toMatch(/INTERNAL|NOT_FOUND|commit|SHA|branche/);
      expect(within(dialog).queryByRole("link", { name: /GitHub/ })).not.toBeInTheDocument();
      expect(dialog.querySelector('a[href="/github"]')).toBeNull();
    },
  );

  it("index en échec (liste) : le client lit « Prévenez l'équipe » sans code ni version", async () => {
    serve("business");
    procedures.specHead.mockResolvedValue(head({ status: "failed", errorCode: "spec_too_large" }));
    renderFeatures();
    await findRole("alert");
    expect(visibleText()).toContain("Prévenez l'équipe : la spec doit être corrigée.");
    expect(everythingVisible()).not.toMatch(TECHNICAL_VALUE);
  });

  it("la fiche ouverte depuis la liste (clic) respecte aussi la vue client", async () => {
    serve("client");
    renderFeatures();
    await findTable();
    await userEvent.click(titleLink("Connexion par e-mail"));
    const dialog = await findRole("dialog");
    await within(dialog).findByText("Description");
    expect(inputsOf(procedures.specGetFeature)[0]).toMatchObject({ specId: "F-001" });
    expect(everythingVisible()).not.toMatch(TECHNICAL_VALUE);
    await waitFor(() => expect(within(dialog).queryByText("Tables")).not.toBeInTheDocument());
    expect(DETAIL.tables).toHaveLength(1);
  });
});

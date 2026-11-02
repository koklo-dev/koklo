import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { endFeatureSession } from "../src/lib/feature-draft.ts";
import { framingDraftKey } from "../src/lib/framing-draft.ts";
import { PROJECT_ID, SCOPE } from "./support/features.tsx";
import {
  accept,
  feature,
  IDEA,
  openFraming,
  proposeFeatures,
  serveFraming,
  T1,
  T2,
  writeIdea,
} from "./support/framing.tsx";
import { findNamed } from "./support/wait.ts";
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
 * TK-59 / 59a et 59b, brouillon repris dans l'écran (S-framing §4.13, §5.3) : sauvegarde, bandeau de reprise,
 * abandon confirmé en ligne, cloisonnement, fin de session, stockage indisponible.
 */
const KEY = framingDraftKey(PROJECT_ID);
const proposal = (title: string, status = "to_review") => ({
  id: `p-${title}`,
  status,
  value: feature(title),
  original: feature(title),
  duplicateOf: null,
});
function seed(over: Record<string, unknown> = {}, owner: Record<string, unknown> = {}) {
  localStorage.setItem(
    KEY,
    JSON.stringify({
      mode: "idea",
      idea: "Idée reprise du brouillon",
      clarifications: "",
      pastedBrief: "",
      brief: null,
      answers: [],
      proposals: [],
      savedAt: new Date().toISOString(),
      ownerId: SCOPE.userId,
      organizationId: SCOPE.organizationId,
      ...over,
      ...owner,
    }),
  );
}
const stored = (): Record<string, unknown> | null => {
  const raw = localStorage.getItem(KEY);
  return raw ? JSON.parse(raw) : null;
};

beforeEach(() => {
  resetWebMocks();
  polyfillRadix();
  watchUrl();
  localStorage.clear();
  serveFraming();
});

describe("Sauvegarde", () => {
  it("l'idée saisie est écrite sous koklo:framing-draft:<projet>, avec son propriétaire", async () => {
    await openFraming();
    await writeIdea();
    await waitFor(() => expect(stored()).not.toBeNull());
    expect(stored()).toMatchObject({
      idea: IDEA,
      ownerId: SCOPE.userId,
      organizationId: SCOPE.organizationId,
    });
  });

  it("rien n'est écrit tant que rien n'est saisi", async () => {
    await openFraming();
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("le brief édité et le statut des propositions sont gardés (59b)", async () => {
    await openFraming();
    await proposeFeatures();
    await accept(T1);
    await waitFor(() => {
      const proposals = (stored()?.proposals ?? []) as Array<{
        status: string;
        value: { title: string };
      }>;
      expect(proposals.find((p) => p.value.title === T1)?.status).toBe("accepted");
      expect(proposals.find((p) => p.value.title === T2)?.status).toBe("to_review");
    });
    expect((stored()?.brief as { title: string } | undefined)?.title).toBe(
      "Portail de réservation",
    );
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("Reprise (§4.13)", () => {
  it("bandeau « Brouillon de cadrage repris (<date>). » + « Abandonner », champs restaurés", async () => {
    seed();
    await openFraming();
    const banner = await findNamed("group", /Brouillon/);
    expect(banner).toHaveTextContent(/Brouillon de cadrage repris \(.+\)\./);
    expect(within(banner).getByRole("button", { name: "Abandonner" })).toBeVisible();
    expect(screen.getByRole("textbox", { name: /^Votre idée/ })).toHaveValue(
      "Idée reprise du brouillon",
    );
  });

  it("propositions reprises avec leur statut et leurs éditions, sans nouvel appel IA", async () => {
    const edited = { ...proposal(T1, "accepted"), value: feature("Titre modifié par l'humain") };
    seed({
      brief: {
        title: "T",
        problem: "P",
        users: "U",
        expectedOutcome: "R",
        constraints: "",
        openQuestions: "",
      },
      proposals: [edited, proposal(T2, "rejected")],
    });
    await openFraming();
    await findNamed("heading", "Titre modifié par l'humain", { level: 3 });
    const items = screen.getAllByRole("listitem").filter((li) => li.querySelector("h3"));
    expect(items[0]).toHaveTextContent("Acceptée");
    expect(items[1]).toHaveTextContent("Rejetée");
    const { aiCallCount } = await import("./support/framing.tsx");
    expect(aiCallCount()).toBe(0);
  });

  it("« Abandonner » demande une confirmation en ligne, focus sur « Garder »", async () => {
    seed();
    await openFraming();
    await userEvent.click(await screen.findByRole("button", { name: "Abandonner" }));
    expect(screen.getByText("Abandonner ce brouillon ?")).toBeVisible();
    expect(screen.getByRole("button", { name: "Garder" })).toHaveFocus();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("« Garder » referme la confirmation sans rien effacer", async () => {
    seed();
    await openFraming();
    await userEvent.click(await screen.findByRole("button", { name: "Abandonner" }));
    await userEvent.click(screen.getByRole("button", { name: "Garder" }));
    expect(screen.queryByText("Abandonner ce brouillon ?")).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /^Votre idée/ })).toHaveValue(
      "Idée reprise du brouillon",
    );
    expect(localStorage.getItem(KEY)).not.toBeNull();
  });

  it("confirmer l'abandon efface le stockage et vide l'écran", async () => {
    seed();
    await openFraming();
    await userEvent.click(await screen.findByRole("button", { name: "Abandonner" }));
    await userEvent.click(
      screen.getAllByRole("button", { name: "Abandonner" }).at(-1) as HTMLElement,
    );
    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: /^Votre idée/ })).toHaveValue(""),
    );
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(screen.queryByRole("group", { name: /Brouillon/ })).not.toBeInTheDocument();
  });
});

describe("Cloisonnement et fin de session", () => {
  it("le brouillon d'un autre compte n'est ni repris ni conservé", async () => {
    seed({}, { ownerId: "u2" });
    await openFraming();
    expect(screen.getByRole("textbox", { name: /^Votre idée/ })).toHaveValue("");
    expect(screen.queryByRole("group", { name: /Brouillon/ })).not.toBeInTheDocument();
    await waitFor(() => expect(localStorage.getItem(KEY)).toBeNull());
  });

  it("le brouillon d'une autre organisation n'est pas repris", async () => {
    seed({}, { organizationId: "01900000-0000-7000-8000-0000000000a2" });
    await openFraming();
    expect(screen.getByRole("textbox", { name: /^Votre idée/ })).toHaveValue("");
  });

  it("un brouillon malformé est supprimé sans casser l'écran", async () => {
    localStorage.setItem(KEY, "{pas du json");
    await openFraming();
    expect(screen.getByRole("textbox", { name: /^Votre idée/ })).toHaveValue("");
    await waitFor(() => expect(localStorage.getItem(KEY)).toBeNull());
  });

  it("déconnexion pendant la saisie : le brouillon est purgé et le démontage ne le réécrit pas", async () => {
    const view = await openFraming();
    await writeIdea();
    await waitFor(() => expect(stored()).not.toBeNull());
    endFeatureSession();
    expect(localStorage.getItem(KEY)).toBeNull();
    view.unmount();
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("une saisie après la fin de session n'est pas écrite", async () => {
    await openFraming();
    endFeatureSession();
    await writeIdea("Après la déconnexion");
    expect(localStorage.getItem(KEY)).toBeNull();
  });
});

describe("Stockage indisponible", () => {
  it("l'écran fonctionne sans brouillon (écriture refusée)", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    await openFraming();
    await writeIdea();
    await userEvent.click(screen.getByRole("button", { name: "Générer un brief avec l'IA" }));
    expect(await findNamed("heading", /^2\. Le brief/)).toBeVisible();
    vi.restoreAllMocks();
  });
});

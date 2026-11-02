import { screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { head, PROJECT_ID } from "./support/features.tsx";
import {
  accept,
  inCard,
  openFraming,
  proposeFeatures,
  reject,
  SAVE,
  saveBar,
  serveFraming,
  submits,
  T1,
} from "./support/framing.tsx";
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
 * TK-59 / 59b, spec non prête et designer (S-framing §4.10, §4.11) : la page reste utilisable, seul
 * l'enregistrement est bloqué, par un message et non par un bouton grisé muet.
 */
beforeEach(() => {
  resetWebMocks();
  polyfillRadix();
  watchUrl();
  localStorage.clear();
  serveFraming();
});

const NOT_READY =
  "La spec du projet n'est pas prête : vous pouvez cadrer, mais l'enregistrement sera possible quand elle le sera.";

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("Spec non prête (§4.10)", () => {
  it("en préparation : la page s'ouvre, l'étape 1 est utilisable, message neutre sous le titre", async () => {
    procedures.specHead.mockResolvedValue(head({ status: "building" }));
    await openFraming();
    expect(await screen.findByText(NOT_READY)).toBeVisible();
    expect(screen.getByRole("button", { name: "Générer un brief avec l'IA" })).toBeVisible();
  });

  it("l'enregistrement est remplacé par le message (pas de bouton grisé muet) ; les acceptées restent", async () => {
    procedures.specHead.mockResolvedValue(head({ status: "building" }));
    await openFraming();
    await proposeFeatures();
    await accept(T1);
    expect(saveBar()).toBeNull();
    expect(screen.queryByRole("button", { name: SAVE })).not.toBeInTheDocument();
    expect(screen.getByText(NOT_READY)).toBeVisible();
    expect(inCard(T1).getByText("Acceptée")).toBeVisible();
    expect(submits()).toHaveLength(0);
  });

  it("sans spec : « Le projet n'a pas encore de spec. » et lien « Voir les fonctionnalités »", async () => {
    procedures.specHead.mockResolvedValue(null);
    procedures.repoList.mockResolvedValue([]);
    await openFraming();
    expect(await screen.findByText("Le projet n'a pas encore de spec.")).toBeVisible();
    expect(screen.getByRole("link", { name: "Voir les fonctionnalités" })).toHaveAttribute(
      "href",
      `/projects/${PROJECT_ID}/features`,
    );
  });

  it("préparation en échec : « La préparation de la spec a échoué. »", async () => {
    procedures.specHead.mockResolvedValue(
      head({ status: "failed", errorCode: "SPEC_INDEX_FAILED" }),
    );
    await openFraming();
    expect(await screen.findByText("La préparation de la spec a échoué.")).toBeVisible();
  });

  it("un rafraîchissement d'état lève le blocage sans perte des propositions", async () => {
    procedures.specHead.mockResolvedValue(head({ status: "building" }));
    await openFraming();
    await proposeFeatures();
    await accept(T1);
    procedures.specHead.mockResolvedValue(head({ status: "ready" }));
    await userEvent.click(screen.getByRole("button", { name: "Actualiser" }));
    expect(
      await screen.findByRole("button", { name: "Enregistrer 1 fonctionnalité" }),
    ).toBeEnabled();
    expect(inCard(T1).getByText("Acceptée")).toBeVisible();
    expect(screen.queryByText(NOT_READY)).not.toBeInTheDocument();
  });

  it("spec prête : aucun message de blocage", async () => {
    await openFraming();
    await proposeFeatures();
    expect(screen.queryByText(NOT_READY)).not.toBeInTheDocument();
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("Designer (§4.11)", () => {
  const MESSAGE =
    "En tant que designer, vous ne pouvez enregistrer qu'une fonctionnalité liée à un écran. Les propositions n'en ont pas : relisez-les ici, puis créez-les depuis le formulaire de la fonctionnalité.";

  beforeEach(() => serveFraming("designer"));

  it("voit l'écran, relit, accepte et rejette", async () => {
    await openFraming();
    await proposeFeatures();
    await accept(T1);
    expect(inCard(T1).getByText("Acceptée")).toBeVisible();
    await reject(T1);
    expect(inCard(T1).getByText("Rejetée")).toBeVisible();
  });

  it("message permanent à la place de l'enregistrement, lien « Ouvrir les fonctionnalités », aucun bouton d'enregistrement", async () => {
    await openFraming();
    await proposeFeatures();
    await accept(T1);
    expect(screen.getByText(MESSAGE)).toBeVisible();
    expect(screen.getByRole("link", { name: "Ouvrir les fonctionnalités" })).toHaveAttribute(
      "href",
      `/projects/${PROJECT_ID}/features`,
    );
    expect(screen.queryByRole("button", { name: SAVE })).not.toBeInTheDocument();
    expect(submits()).toHaveLength(0);
  });

  it("le message est là dès l'arrivée des propositions, sans qu'il faille d'abord accepter", async () => {
    await openFraming();
    await proposeFeatures();
    expect(screen.getByText(MESSAGE)).toBeVisible();
  });

  it("le brouillon garde les propositions acceptées", async () => {
    await openFraming();
    await proposeFeatures();
    await accept(T1);
    await waitFor(() => {
      const raw = localStorage.getItem(`koklo:framing-draft:${PROJECT_ID}`);
      expect(raw).not.toBeNull();
      expect(
        JSON.parse(raw as string).proposals.some(
          (p: { status: string }) => p.status === "accepted",
        ),
      ).toBe(true);
    });
  });

  it.each(["owner", "admin", "dev"] as const)(
    "%s ne voit jamais le message designer",
    async (role) => {
      serveFraming(role);
      await openFraming();
      await proposeFeatures();
      expect(screen.queryByText(MESSAGE)).not.toBeInTheDocument();
    },
  );
});

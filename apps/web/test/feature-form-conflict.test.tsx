import { waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clickSave,
  fillMinimum,
  linkField,
  NEW_SHA,
  openCreate,
  openEdit,
  openLinks,
  operationOf,
  pick,
  serveWrite,
  setText,
  submitInputs,
  titleField,
} from "./support/feature-form.tsx";
import { DETAIL, head } from "./support/features.tsx";
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
 * TK-48 / 48e : conflit de version (S-feature-form §4.7, §5.8, AC-48-26) et règle du designer (§5.4, AC-48-27).
 */
beforeEach(() => {
  resetWebMocks();
  polyfillRadix();
  watchUrl();
  localStorage.clear();
  serveWrite();
});

const CURRENT = {
  ...DETAIL,
  title: "Titre de la spec",
  priority: "could",
  description: "Description de la spec",
  commitSha: NEW_SHA,
};
const stale = () => apiError("SPEC_BATCH_CONFLICT", { reason: "stale_base" });
const RELOAD = "Recharger la version actuelle";

async function editAndConflict() {
  const panel = await openEdit();
  await setText(titleField(panel), "Mon titre");
  await pick(panel, "Priorité (obligatoire)", "Importante");
  procedures.specBatchSubmit.mockRejectedValueOnce(stale());
  await clickSave(panel);
  const alert = await panel.findByRole("alert");
  return { panel, alert };
}
function currentVersionChanges() {
  procedures.specHead.mockResolvedValue(head({ commitSha: NEW_SHA }));
  procedures.specGetFeature.mockResolvedValue(CURRENT);
}

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("stale_base : « Recharger la version actuelle » (comparaison à trois, §5.8)", () => {
  it("l'alerte annonce que la spec a changé, rien d'écrit, saisie conservée, action « Recharger… »", async () => {
    const { panel, alert } = await editAndConflict();
    expect(
      within(alert).getByText("La spec a changé depuis que vous avez ouvert ce formulaire"),
    ).toBeVisible();
    expect(alert).toHaveTextContent(
      "Rien n'a été écrit. Rechargez la version actuelle : vos modifications sont conservées.",
    );
    expect(within(alert).getByRole("button", { name: RELOAD })).toBeVisible();
    expect(titleField(panel)).toHaveValue("Mon titre");
  });

  it("recharger relit spec.head et spec.getFeature", async () => {
    const { alert } = await editAndConflict();
    const heads = procedures.specHead.mock.calls.length;
    const reads = procedures.specGetFeature.mock.calls.length;
    currentVersionChanges();
    await userEvent.click(within(alert).getByRole("button", { name: RELOAD }));
    await waitFor(() => expect(procedures.specGetFeature.mock.calls.length).toBeGreaterThan(reads));
    expect(procedures.specHead.mock.calls.length).toBeGreaterThan(heads);
  });

  it("champs modifiés par vous seul : votre valeur ; champs que vous n'avez pas touchés : la version actuelle", async () => {
    const { panel, alert } = await editAndConflict();
    currentVersionChanges();
    await userEvent.click(within(alert).getByRole("button", { name: RELOAD }));
    await waitFor(() =>
      expect(panel.getByRole("textbox", { name: "Description" })).toHaveValue(
        "Description de la spec",
      ),
    );
    expect(titleField(panel)).toHaveValue("Mon titre");
    expect(panel.getByRole("combobox", { name: "Priorité (obligatoire)" })).toHaveTextContent(
      "Importante",
    );
  });

  it("champs modifiés des deux côtés : votre valeur gardée, signalés en tête et sous le champ", async () => {
    const { panel, alert } = await editAndConflict();
    currentVersionChanges();
    await userEvent.click(within(alert).getByRole("button", { name: RELOAD }));
    const notice = await panel.findByText(
      "Ces champs ont aussi changé dans la spec : Titre, Priorité. Vérifiez-les avant d'enregistrer.",
    );
    expect(notice).toBeVisible();
    expect(notice.closest("[role='alert']")).toBeNull();
    expect(panel.getByText("Valeur actuelle dans la spec : Titre de la spec")).toBeVisible();
    expect(panel.getByText("Valeur actuelle dans la spec : Souhaitable")).toBeVisible();
    expect(panel.queryByText(/Valeur actuelle dans la spec : Description/)).toBeNull();
    expect(panel.getAllByRole("button", { name: "Reprendre la valeur actuelle" })).toHaveLength(2);
  });

  it("« Reprendre la valeur actuelle » remplace votre valeur et retire le signalement du champ", async () => {
    const { panel, alert } = await editAndConflict();
    currentVersionChanges();
    await userEvent.click(within(alert).getByRole("button", { name: RELOAD }));
    await panel.findByText("Valeur actuelle dans la spec : Titre de la spec");
    await userEvent.click(
      panel.getAllByRole("button", { name: "Reprendre la valeur actuelle" })[0] as HTMLElement,
    );
    expect(titleField(panel)).toHaveValue("Titre de la spec");
    expect(panel.queryByText("Valeur actuelle dans la spec : Titre de la spec")).toBeNull();
    expect(panel.getAllByRole("button", { name: "Reprendre la valeur actuelle" })).toHaveLength(1);
  });

  it("l'envoi suivant utilise la nouvelle référence : baseSha actuel, seulement les champs qui diffèrent de la version actuelle, NOUVELLE clé", async () => {
    const { panel, alert } = await editAndConflict();
    const firstKey = submitInputs()[0]?.idempotencyKey;
    currentVersionChanges();
    await userEvent.click(within(alert).getByRole("button", { name: RELOAD }));
    await panel.findByText(/Ces champs ont aussi changé/);
    procedures.specBatchSubmit.mockReturnValue(new Promise(() => undefined));
    await clickSave(panel);
    await waitFor(() => expect(submitInputs()).toHaveLength(2));
    const second = submitInputs()[1] ?? {};
    expect(second.baseSha).toBe(NEW_SHA);
    expect(second.idempotencyKey).not.toBe(firstKey);
    expect(operationOf(second)).toStrictEqual({
      kind: "feature.update",
      specId: "F-001",
      title: "Mon titre",
      priority: "should",
    });
  });

  it("pas de conflit sur un champ que la spec n'a pas touché : aucun signalement", async () => {
    const { panel, alert } = await editAndConflict();
    procedures.specHead.mockResolvedValue(head({ commitSha: NEW_SHA }));
    procedures.specGetFeature.mockResolvedValue({
      ...DETAIL,
      description: "Autre description",
      commitSha: NEW_SHA,
    });
    await userEvent.click(within(alert).getByRole("button", { name: RELOAD }));
    await waitFor(() =>
      expect(panel.getByRole("textbox", { name: "Description" })).toHaveValue("Autre description"),
    );
    expect(panel.queryByText(/Ces champs ont aussi changé/)).toBeNull();
    expect(panel.queryByRole("button", { name: "Reprendre la valeur actuelle" })).toBeNull();
  });

  it("deux stale_base d'affilée sans nouvelle version lue : « La spec est en cours de relecture. Réessayez dans un instant. »", async () => {
    const { panel, alert } = await editAndConflict();
    procedures.specBatchSubmit.mockRejectedValue(stale());
    await userEvent.click(within(alert).getByRole("button", { name: RELOAD }));
    await waitFor(() => expect(procedures.specGetFeature.mock.calls.length).toBeGreaterThan(1));
    await clickSave(panel);
    await waitFor(() => expect(submitInputs()).toHaveLength(2));
    await userEvent.click(
      await within(await panel.findByRole("alert")).findByRole("button", { name: RELOAD }),
    );
    await waitFor(() => expect(procedures.specGetFeature.mock.calls.length).toBeGreaterThan(2));
    await clickSave(panel);
    const again = await panel.findByText(
      "La spec est en cours de relecture. Réessayez dans un instant.",
    );
    expect(again).toBeVisible();
    expect(titleField(panel)).toHaveValue("Mon titre");
  });
});

describe("write_conflict en modification", () => {
  it("« Cette fonctionnalité a changé ou n'existe plus dans la spec » + « Recharger la version actuelle »", async () => {
    const panel = await openEdit();
    await setText(titleField(panel), "Mon titre");
    procedures.specBatchSubmit.mockRejectedValueOnce(
      apiError("SPEC_BATCH_CONFLICT", { reason: "write_conflict" }),
    );
    await clickSave(panel);
    const alert = await panel.findByRole("alert");
    expect(
      within(alert).getByText("Cette fonctionnalité a changé ou n'existe plus dans la spec"),
    ).toBeVisible();
    expect(alert).toHaveTextContent("Rechargez-la pour voir où elle en est.");
    expect(within(alert).getByRole("button", { name: RELOAD })).toBeVisible();
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("Designer : fonctionnalité liée à au moins un écran (AC-48-27)", () => {
  const MESSAGE = "Liez au moins un écran pour enregistrer cette fonctionnalité.";
  const HELP =
    "En tant que designer, vous pouvez enregistrer une fonctionnalité seulement si elle est liée à au moins un écran.";
  beforeEach(() => serveWrite("designer"));

  it("« Éléments liés » ouvert d'office, avec l'aide permanente sous « Écrans »", async () => {
    const panel = await openCreate();
    expect(panel.getByRole("button", { name: /Éléments liés/ })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(panel.getByText(HELP)).toBeVisible();
    expect(linkField(panel, "Écrans")).toHaveAccessibleDescription(/En tant que designer/);
  });

  it("création sans écran : aucun appel, erreur sur « Écrans », liée depuis le résumé", async () => {
    const panel = await openCreate();
    await fillMinimum(panel);
    await clickSave(panel);
    expect(await panel.findByRole("link", { name: MESSAGE })).toBeVisible();
    expect(linkField(panel, "Écrans")).toHaveAttribute("aria-invalid", "true");
    expect(linkField(panel, "Écrans")).toHaveAccessibleDescription(
      new RegExp(MESSAGE.slice(0, 20)),
    );
    expect(submitInputs()).toEqual([]);
  });

  it("création avec un écran : l'envoi part", async () => {
    procedures.specBatchSubmit.mockReturnValue(new Promise(() => undefined));
    const panel = await openCreate();
    await fillMinimum(panel);
    await setText(linkField(panel, "Écrans"), "S-login");
    await clickSave(panel);
    await waitFor(() => expect(submitInputs()).toHaveLength(1));
    expect(operationOf()).toMatchObject({ screens: ["S-login"] });
  });

  it("modification d'une fonctionnalité liée : retirer tous les écrans est refusé", async () => {
    const panel = await openEdit();
    await setText(linkField(panel, "Écrans"), "");
    await clickSave(panel);
    expect(await panel.findByRole("link", { name: MESSAGE })).toBeVisible();
    expect(submitInputs()).toEqual([]);
  });

  it("modification d'une fonctionnalité liée, autre champ : l'envoi part", async () => {
    procedures.specBatchSubmit.mockReturnValue(new Promise(() => undefined));
    const panel = await openEdit();
    await setText(titleField(panel), "Un autre titre");
    await clickSave(panel);
    await waitFor(() => expect(submitInputs()).toHaveLength(1));
  });

  it("modification d'une fonctionnalité sans écran avant : refusée même en ajoutant un écran ailleurs", async () => {
    procedures.specGetFeature.mockResolvedValue({ ...DETAIL, screens: [] });
    const panel = await openEdit();
    await setText(titleField(panel), "Un autre titre");
    await clickSave(panel);
    expect(await panel.findByRole("link", { name: MESSAGE })).toBeVisible();
    expect(submitInputs()).toEqual([]);
  });

  it("le serveur reste l'autorité : FORBIDDEN malgré un écran lié est rendu tel quel", async () => {
    procedures.specBatchSubmit.mockRejectedValue(apiError("FORBIDDEN"));
    const panel = await openCreate();
    await fillMinimum(panel);
    await openLinks(panel);
    await setText(linkField(panel, "Écrans"), "S-login");
    await clickSave(panel);
    const alert = await panel.findByRole("alert");
    expect(alert).toHaveTextContent(
      "Vous ne pouvez enregistrer que les fonctionnalités liées à un écran",
    );
  });
});

describe("Autres rôles d'équipe : pas de règle d'écran", () => {
  it.each(["owner", "admin", "dev"] as const)(
    "%s : pas d'aide designer, création sans écran permise, « Éléments liés » fermé",
    async (role) => {
      serveWrite(role);
      procedures.specBatchSubmit.mockReturnValue(new Promise(() => undefined));
      const panel = await openCreate();
      expect(panel.queryByText(/En tant que designer/)).toBeNull();
      expect(panel.getByRole("button", { name: /Éléments liés/ })).toHaveAttribute(
        "aria-expanded",
        "false",
      );
      await fillMinimum(panel);
      await clickSave(panel);
      await waitFor(() => expect(submitInputs()).toHaveLength(1));
    },
  );

  it("propriétaire : retirer tous les écrans d'une fonctionnalité est permis", async () => {
    procedures.specBatchSubmit.mockReturnValue(new Promise(() => undefined));
    const panel = await openEdit();
    await setText(linkField(panel, "Écrans"), "");
    await clickSave(panel);
    await waitFor(() => expect(submitInputs()).toHaveLength(1));
    expect(operationOf()).toMatchObject({ screens: [] });
  });
});

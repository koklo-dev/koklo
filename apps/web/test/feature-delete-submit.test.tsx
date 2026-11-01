import { specBatchSubmitInputSchema } from "@koklo/contract";
import { screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  askDelete,
  confirmDelete,
  DELETE_BUTTON,
  deleteF001,
  lastSubmit,
  liveText,
  NEW_SHA,
  openEdit,
  operationOf,
  serveWrite,
  setText,
  statusRegions,
  submitInputs,
  titleField,
} from "./support/feature-form.tsx";
import { head, PROJECT_ID, SHA } from "./support/features.tsx";
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
 * TK-48 / 48e-2, envoi de la suppression (S-feature-form §4.8, §5.2, AC-48-24) : UNE opération `feature.delete`
 * avec `baseSha` = `spec.head.commitSha` lu à l'ouverture, nouvelle clé d'idempotence à chaque suppression,
 * un seul appel même au double clic, clé réutilisée seulement après une absence de réponse (réseau) ou un
 * `INTERNAL` de `submit`, nouvelle clé après tout échec terminal.
 */
beforeEach(() => {
  resetWebMocks();
  polyfillRadix();
  watchUrl();
  localStorage.clear();
  serveWrite();
  procedures.specBatchSubmit.mockReturnValue(new Promise(() => undefined));
});

const KEY_PATTERN = /^feature-[A-Za-z0-9-]+$/;

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("L'entrée de specBatch.submit pour une suppression", () => {
  it("exactement une opération feature.delete, baseSha = version lue, branche lue, sans message", async () => {
    await deleteF001();
    await waitFor(() => expect(submitInputs()).toHaveLength(1));
    expect(lastSubmit()).toStrictEqual({
      projectId: PROJECT_ID,
      idempotencyKey: expect.stringMatching(KEY_PATTERN),
      branch: "main",
      baseSha: SHA,
      operations: [{ kind: "feature.delete", specId: "F-001" }],
    });
    expect(specBatchSubmitInputSchema.safeParse(lastSubmit()).success).toBe(true);
  });

  it("baseSha = spec.head.commitSha lu à l'ouverture, branche = spec.head.branch", async () => {
    const other = "c3d4e5f60718293a4b5c6d7e8f9012345678abcd";
    procedures.specHead.mockResolvedValue(head({ commitSha: other, branch: "cadrage" }));
    await deleteF001();
    await waitFor(() => expect(submitInputs()).toHaveLength(1));
    expect(lastSubmit()).toMatchObject({ baseSha: other, branch: "cadrage" });
  });

  it("la saisie en cours du formulaire n'est pas envoyée : l'opération reste { kind, specId }", async () => {
    const panel = await openEdit();
    await setText(titleField(panel), "Titre modifié mais pas enregistré");
    await confirmDelete(panel);
    await waitFor(() => expect(submitInputs()).toHaveLength(1));
    expect(operationOf()).toStrictEqual({ kind: "feature.delete", specId: "F-001" });
    expect(JSON.stringify(lastSubmit())).not.toMatch(/Titre modifié|"title"|"priority"/);
  });

  it("jamais de chemin de fichier, de message ni d'identifiant inventé", async () => {
    await deleteF001();
    await waitFor(() => expect(submitInputs()).toHaveLength(1));
    expect(JSON.stringify(lastSubmit())).not.toMatch(/\.yaml|\.koklo|"message"|F-00[2-9]/);
  });

  it("double clic sur « Supprimer » : un seul appel", async () => {
    const panel = await openEdit();
    const confirmation = await askDelete(panel);
    await userEvent.dblClick(confirmation.getByRole("button", { name: "Supprimer" }));
    await waitFor(() => expect(submitInputs()).toHaveLength(1));
    expect(submitInputs()).toHaveLength(1);
  });

  it("envoi en cours : « Suppression… » aria-busy, « Garder » désactivé, champs en lecture seule, région « Envoi de la suppression… »", async () => {
    const panel = await openEdit();
    const confirmation = await askDelete(panel);
    await userEvent.click(confirmation.getByRole("button", { name: "Supprimer" }));
    const busy = await panel.findByRole("button", { name: "Suppression…" });
    expect(busy).toHaveAttribute("aria-busy", "true");
    expect(panel.getByRole("button", { name: "Garder" })).toBeDisabled();
    expect(titleField(panel)).toHaveAttribute("readonly");
    await waitFor(() => expect(liveText()).toContain("Envoi de la suppression…"));
    expect(statusRegions()).toHaveLength(1);
  });

  it("une suppression ne passe pas par « Enregistrer » : ce bouton n'est pas utilisé et aucun second envoi ne part", async () => {
    const panel = await openEdit();
    await confirmDelete(panel);
    await waitFor(() => expect(submitInputs()).toHaveLength(1));
    expect(panel.queryByRole("button", { name: DELETE_BUTTON })).toBeNull();
    expect(screen.queryByRole("button", { name: "Enregistrer" })).toBeNull();
    expect(submitInputs()).toHaveLength(1);
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("Clé d'idempotence d'une suppression (AC-48-24)", () => {
  const retry = (panel: Awaited<ReturnType<typeof openEdit>>) =>
    userEvent.click(panel.getByRole("button", { name: "Réessayer" }));

  it("la clé a la forme feature-<uuid> (lettres, chiffres, tirets)", async () => {
    await deleteF001();
    await waitFor(() => expect(submitInputs()).toHaveLength(1));
    expect(lastSubmit().idempotencyKey).toMatch(KEY_PATTERN);
  });

  it("absence de réponse (réseau) : « Réessayer » renvoie la MÊME suppression avec la MÊME clé, sans nouvelle confirmation", async () => {
    procedures.specBatchSubmit.mockRejectedValueOnce(new TypeError("fetch failed"));
    const panel = await openEdit();
    await confirmDelete(panel);
    await panel.findByText("Impossible de confirmer l'enregistrement");
    expect(panel.queryByRole("group", { name: "Confirmer la suppression" })).toBeNull();
    await retry(panel);
    await waitFor(() => expect(submitInputs()).toHaveLength(2));
    expect(submitInputs()[1]?.idempotencyKey).toBe(submitInputs()[0]?.idempotencyKey);
    expect(submitInputs()[1]).toStrictEqual(submitInputs()[0]);
  });

  it("INTERNAL de submit : aucun réessai tout seul ; « Réessayer » reprend la même clé (saisie identique), « Vérifier la liste » est proposé", async () => {
    procedures.specBatchSubmit.mockRejectedValueOnce(apiError("INTERNAL", { requestId: "req-7" }));
    const panel = await openEdit();
    await confirmDelete(panel);
    const alert = await panel.findByRole("alert");
    expect(alert).toHaveTextContent("Nous ne savons pas si l'enregistrement a abouti");
    expect(panel.getByRole("button", { name: "Vérifier la liste" })).toBeVisible();
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(submitInputs()).toHaveLength(1);
    await retry(panel);
    await waitFor(() => expect(submitInputs()).toHaveLength(2));
    expect(submitInputs()[1]?.idempotencyKey).toBe(submitInputs()[0]?.idempotencyKey);
    expect(submitInputs()[1]?.baseSha).toBe(submitInputs()[0]?.baseSha);
  });

  it.each([
    ["PROVIDER_UNAVAILABLE", "GitHub est momentanément indisponible"],
    ["PROVIDER_RATE_LIMITED", "Trop de demandes pour le moment"],
  ])("%s : « Réessayer » prépare une NOUVELLE clé", async (code, title) => {
    procedures.specBatchSubmit.mockRejectedValueOnce(apiError(code));
    const panel = await openEdit();
    await confirmDelete(panel);
    await panel.findByText(title);
    await retry(panel);
    await waitFor(() => expect(submitInputs()).toHaveLength(2));
    expect(submitInputs()[1]?.idempotencyKey).not.toBe(submitInputs()[0]?.idempotencyKey);
    expect(operationOf(submitInputs()[1])).toStrictEqual({
      kind: "feature.delete",
      specId: "F-001",
    });
  });

  it("après une nouvelle version lue (rechargement), la suppression repart avec le nouveau baseSha ET une nouvelle clé", async () => {
    procedures.specBatchSubmit.mockRejectedValueOnce(
      apiError("SPEC_BATCH_CONFLICT", { reason: "stale_base" }),
    );
    const panel = await openEdit();
    await confirmDelete(panel);
    await panel.findByText("La spec a changé depuis que vous avez ouvert ce formulaire");
    procedures.specHead.mockResolvedValue(head({ commitSha: NEW_SHA }));
    procedures.specGetFeature.mockResolvedValue({
      ...(await procedures.specGetFeature()),
      commitSha: NEW_SHA,
    });
    await userEvent.click(panel.getByRole("button", { name: "Recharger la version actuelle" }));
    await waitFor(() => expect(panel.getByRole("button", { name: DELETE_BUTTON })).toBeVisible());
    await confirmDelete(panel);
    await waitFor(() => expect(submitInputs()).toHaveLength(2));
    expect(submitInputs()[1]?.baseSha).toBe(NEW_SHA);
    expect(submitInputs()[1]?.idempotencyKey).not.toBe(submitInputs()[0]?.idempotencyKey);
  });
});

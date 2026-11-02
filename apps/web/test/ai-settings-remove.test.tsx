import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  button,
  CONFIRM_GROUP,
  credential,
  KEEP,
  keyField,
  openAiSettings,
  queryButton,
  REMOVE,
  serveAiSettings,
  statusText,
} from "./support/ai-settings.tsx";
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

/** Réglages de l'IA, retrait de la clé avec confirmation en ligne (S-ai-settings §4.9) : pas de modale. */
beforeEach(() => {
  resetWebMocks();
  polyfillRadix();
  localStorage.clear();
  serveAiSettings("owner", [credential()]);
});

const group = () => screen.getByRole("group", { name: CONFIRM_GROUP });
async function askRemoval() {
  await openAiSettings();
  await userEvent.click(button(REMOVE));
  return within(await screen.findByRole("group", { name: CONFIRM_GROUP }));
}

describe("confirmation en ligne", () => {
  it("remplace les actions par un groupe nommé, sans modale, avec le texte exact", async () => {
    const confirm = await askRemoval();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(group()).toHaveTextContent(
      "Retirer la clé Anthropic ? L'IA cessera de fonctionner pour toute l'organisation (cadrage assisté) tant qu'une nouvelle clé n'aura pas été enregistrée. Cette action ne supprime rien chez Anthropic.",
    );
    expect(confirm.getByRole("button", { name: REMOVE })).toBeEnabled();
    expect(confirm.getByRole("button", { name: KEEP })).toBeEnabled();
    expect(queryButton("Vérifier à nouveau")).not.toBeInTheDocument();
    expect(queryButton("Remplacer la clé")).not.toBeInTheDocument();
    expect(procedures.llmCredentialRemove).not.toHaveBeenCalled();
  });

  it("focus initial sur « Garder la clé » (l'option sûre)", async () => {
    const confirm = await askRemoval();
    await waitFor(() => expect(confirm.getByRole("button", { name: KEEP })).toHaveFocus());
  });

  it("« Garder la clé » referme sans appel ; le focus revient sur « Retirer la clé »", async () => {
    const confirm = await askRemoval();
    await userEvent.click(confirm.getByRole("button", { name: KEEP }));
    expect(screen.queryByRole("group", { name: CONFIRM_GROUP })).not.toBeInTheDocument();
    expect(button(REMOVE)).toHaveFocus();
    expect(procedures.llmCredentialRemove).not.toHaveBeenCalled();
  });

  it("Échap = « Garder la clé »", async () => {
    await askRemoval();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("group", { name: CONFIRM_GROUP })).not.toBeInTheDocument();
    expect(procedures.llmCredentialRemove).not.toHaveBeenCalled();
    expect(button(REMOVE)).toBeInTheDocument();
  });
});

describe("retrait", () => {
  it("confirmer appelle remove UNE fois avec le fournisseur ; carte absente, région d'état, focus sur le champ", async () => {
    const confirm = await askRemoval();
    procedures.llmCredentialList.mockResolvedValue({ items: [] });
    await userEvent.click(confirm.getByRole("button", { name: REMOVE }));
    expect(await screen.findByText("Non configurée")).toBeInTheDocument();
    expect(procedures.llmCredentialRemove).toHaveBeenCalledTimes(1);
    expect(procedures.llmCredentialRemove.mock.calls[0]?.[0]).toEqual({ provider: "anthropic" });
    expect(statusText()).toContain("Clé retirée.");
    await waitFor(() => expect(keyField()).toHaveFocus());
    expect(keyField()).toHaveValue("");
  });

  it("double clic sur la confirmation : un seul remove", async () => {
    procedures.llmCredentialRemove.mockReturnValue(new Promise(() => undefined));
    const confirm = await askRemoval();
    await userEvent.dblClick(confirm.getByRole("button", { name: REMOVE }));
    expect(procedures.llmCredentialRemove).toHaveBeenCalledTimes(1);
  });

  it("404 (déjà retirée) : traité comme un succès", async () => {
    procedures.llmCredentialRemove.mockRejectedValue(apiError("NOT_FOUND"));
    const confirm = await askRemoval();
    procedures.llmCredentialList.mockResolvedValue({ items: [] });
    await userEvent.click(confirm.getByRole("button", { name: REMOVE }));
    expect(await screen.findByText("Non configurée")).toBeInTheDocument();
    expect(statusText()).toContain("Clé retirée.");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("erreur : alerte « Impossible de retirer la clé. Réessayez. », la clé reste affichée", async () => {
    procedures.llmCredentialRemove.mockRejectedValue(apiError("INTERNAL"));
    const confirm = await askRemoval();
    await userEvent.click(confirm.getByRole("button", { name: REMOVE }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Impossible de retirer la clé. Réessayez.",
    );
    expect(screen.queryByText("Non configurée")).not.toBeInTheDocument();
    expect(screen.getAllByRole("alert")).toHaveLength(1);
  });

  it("disponible aussi quand la clé est invalide", async () => {
    serveAiSettings("owner", [
      credential({ invalid: true, invalidatedAt: "2026-10-28T12:00:00.000Z" }),
    ]);
    await openAiSettings();
    await userEvent.click(button(REMOVE));
    expect(await screen.findByRole("group", { name: CONFIRM_GROUP })).toBeInTheDocument();
  });
});

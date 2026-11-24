import { render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SaveFailureNotice } from "../src/components/save-failure-notice.tsx";
import {
  BLOCKED_TEXT,
  SAVE_FAILURE_TEXT,
  SAVED_TEXT,
  skipReasonText,
} from "../src/lib/proposal-labels.ts";
import { inputsOf } from "./support/features.tsx";
import { type FailedBatch, many, renderTeam, serveProposals } from "./support/proposals.tsx";
import { findNamed } from "./support/wait.ts";
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
 * TK-114e (B672 à B674, DESIGN §5.25, S-spec-architecture §16) : alerte « Enregistrement échoué » de la relecture
 * partagée, motif en mots simples, « Réessayer l'enregistrement » avec `skipConflicts` et une nouvelle clé.
 */
beforeEach(() => {
  resetWebMocks();
  polyfillRadix();
  watchUrl();
});

const CONFLICT: FailedBatch = {
  id: "0190dddd-0000-7000-8000-000000000001",
  status: "conflict",
  errorCode: "write_conflict",
};
const CONFLICT_REASON = "un élément proposé existait déjà dans la spec ou avait changé entre-temps";
const statusText = () => document.querySelector("[data-slot=proposal-review] [role=status]");
/** 40 acceptées tenues par le lot en conflit : relecture groupée, filtre « À relire » (rien de chargé à plat). */
const held = () => many(40, 4, () => ({ status: "accepted", appliedBatchId: CONFLICT.id }));
const alert = () => screen.findByRole("alert");

describe("textes (mots simples, jamais de code)", () => {
  it("motif par code : conflit, spec invalide, dépôt, autre", () => {
    const text = (code: string | null) => SAVE_FAILURE_TEXT(3, code);
    expect(text("write_conflict")).toBe(
      `L'enregistrement de 3 propositions acceptées n'a pas abouti : ${CONFLICT_REASON}. Rien n'a été écrit dans la spec.`,
    );
    expect(text("stale_base")).toContain(CONFLICT_REASON);
    expect(text("SPEC_INVALID")).toContain(": la spec obtenue aurait contenu des erreurs.");
    expect(text("PROVIDER_UNAVAILABLE")).toContain(": le dépôt de la spec n'a pas répondu.");
    expect(text("PROVIDER_RATE_LIMITED")).toContain(": le dépôt de la spec n'a pas répondu.");
    expect(text("mystery")).toContain(": l'enregistrement n'a pas pu se terminer.");
    expect(text(null)).toContain(": l'enregistrement n'a pas pu se terminer.");
    expect(SAVE_FAILURE_TEXT(1, "SPEC_INVALID")).toMatch(
      /^L'enregistrement de 1 proposition acceptée /,
    );
    expect(BLOCKED_TEXT).toBe("Enregistrement échoué · à réessayer");
  });

  it("récapitulatif : « N enregistrées dans la spec · M remises à relire : motif »", () => {
    expect(SAVED_TEXT(121, 0, ["exists"])).toBe(
      "121 enregistrées dans la spec · 1 remise à relire : existe déjà dans la spec",
    );
    expect(SAVED_TEXT(3, 0, ["exists", "missing", "exists"])).toBe(
      "3 enregistrées dans la spec · 3 remises à relire : existe déjà dans la spec, n'existe plus dans la spec",
    );
    expect(SAVED_TEXT(2, 0)).toBe("2 enregistrées dans la spec");
    expect(SAVED_TEXT(25, 225)).toBe("25 enregistrées, 225 à reprendre");
    expect(skipReasonText("duplicate")).toBe("en double dans l'enregistrement");
  });
});

describe("SaveFailureNotice", () => {
  it("InlineAlert error (role=alert), une seule action ; pendant l'envoi « Enregistrement… » désactivé", async () => {
    const onRetry = vi.fn();
    const failure = { count: 2, errorCode: "SPEC_INVALID" };
    const { rerender } = render(
      <SaveFailureNotice failure={failure} saving={false} onRetry={onRetry} />,
    );
    const box = screen.getByRole("alert");
    expect(box).toHaveAttribute("data-variant", "error");
    expect(box.textContent).not.toContain("SPEC_INVALID");
    await userEvent.click(screen.getByRole("button", { name: "Réessayer l'enregistrement" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    rerender(<SaveFailureNotice failure={failure} saving onRetry={onRetry} />);
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Enregistrement…" })).toBeDisabled();
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("relecture : lot en conflit qui tient des acceptées (B668)", () => {
  it("alerte même en relecture groupée (> 30), aucun code brut, bouton du bandeau retiré", async () => {
    serveProposals(held(), { failed: CONFLICT });
    renderTeam("?view=review");
    expect((await alert()).textContent).toBe(
      `L'enregistrement de 40 propositions acceptées n'a pas abouti : ${CONFLICT_REASON}. Rien n'a été écrit dans la spec.Réessayer l'enregistrement`,
    );
    expect(document.body.textContent).not.toContain("write_conflict");
    expect(screen.queryByRole("button", { name: /^Enregistrer \d+ dans la spec/ })).toBeNull();
    // L'avis « Tout est relu. Enregistrez… » de la vue ne double pas l'alerte (la liste vide garde sa note).
    const notes = screen.queryAllByRole("note").map((note) => note.textContent ?? "");
    expect(notes.some((text) => text.includes("Tout est relu"))).toBe(false);
    expect(screen.getAllByRole("alert")).toHaveLength(1);
  });

  it("Réessayer : submit avec skipConflicts et une clé -r ; récapitulatif annoncé ; alerte retirée", async () => {
    const items = held();
    const returned = items[0]?.id as string;
    serveProposals(items, { failed: CONFLICT, skip: [returned] });
    renderTeam("?view=review");
    await userEvent.click(await findNamed("button", "Réessayer l'enregistrement"));
    await waitFor(() => expect(procedures.specBatchSubmit).toHaveBeenCalledTimes(1));
    const input = inputsOf(procedures.specBatchSubmit)[0] as {
      operations: unknown[];
      proposalIds: string[];
      idempotencyKey: string;
      skipConflicts: { proposals: string[] };
    };
    expect(input.proposalIds).toHaveLength(40);
    expect(input.skipConflicts.proposals).toHaveLength(input.operations.length);
    expect(input.idempotencyKey).toMatch(/-1-[a-z0-9]+-r[a-z0-9]+$/);
    expect(input.idempotencyKey.length).toBeLessThanOrEqual(128);
    await waitFor(() =>
      expect(statusText()?.textContent).toContain(
        "39 enregistrées dans la spec · 1 remise à relire : existe déjà dans la spec",
      ),
    );
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });

  it("tout écarté (409 avec skipped) : aucun lot, « 0 enregistrée · N remises à relire »", async () => {
    const items = many(2, 1, () => ({ status: "accepted", appliedBatchId: CONFLICT.id }));
    serveProposals(items, { failed: CONFLICT, skip: items.map((p) => p.id) });
    renderTeam("?view=review");
    await userEvent.click(await findNamed("button", "Réessayer l'enregistrement"));
    await waitFor(() =>
      expect(statusText()?.textContent).toContain(
        "0 enregistrée dans la spec · 2 remises à relire : existe déjà dans la spec",
      ),
    );
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });

  it("enregistrement normal : skipConflicts envoyé aussi, clé sans suffixe -r", async () => {
    serveProposals(many(3, 1, () => ({ status: "accepted" })));
    renderTeam("?view=review");
    await userEvent.click(await findNamed("button", "Enregistrer 3 dans la spec"));
    await waitFor(() => expect(procedures.specBatchSubmit).toHaveBeenCalledTimes(1));
    const input = inputsOf(procedures.specBatchSubmit)[0] as {
      idempotencyKey: string;
      skipConflicts: { proposals: string[] };
    };
    expect(input.skipConflicts.proposals).toHaveLength(3);
    expect(input.idempotencyKey).not.toMatch(/-1-[a-z0-9]+-r[a-z0-9]+$/);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

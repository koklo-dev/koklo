"use client";

import { Button, SheetFooter } from "@koklo/ui";
import { REASON_ID } from "../lib/feature-form-ids.ts";
import type { FeatureDelete } from "../lib/use-feature-delete.ts";
import type { FeatureFormModel } from "../lib/use-feature-form.ts";
import type { FeatureWrite } from "../lib/use-feature-submit.ts";
import { FeatureDeleteConfirm, FeatureDeleteTrigger } from "./feature-delete-confirm.tsx";

/** Suppression proposée dans le pied : seulement en modification, une fois la fonctionnalité lue. */
export interface DeleteEntry {
  del: FeatureDelete;
  specId: string;
  title: string;
  disabled: boolean;
  explained: boolean;
}

/** Entrée de la suppression, désactivée tant qu'une écriture suit son cours ; `null` hors modification. */
export function deleteEntry(
  mode: "create" | "edit",
  specId: string | undefined,
  model: FeatureFormModel,
  write: FeatureWrite,
): DeleteEntry | null {
  const baseline = model.state.baseline;
  if (mode !== "edit" || !specId || !baseline) return null;
  return {
    del: model.del,
    specId,
    title: baseline.title.trim(),
    disabled: write.busy || (model.mine && write.phase === "late"),
    explained: write.busy && !model.mine,
  };
}

interface FooterProps {
  busy: boolean;
  disabled: boolean;
  reason: string | null;
  onClose: () => void;
  remove: DeleteEntry | null;
}

/** Pied du panneau : « Enregistrer », « Fermer », suppression ; la confirmation le remplace (S-feature-form §4.8). */
export function FormFooter({ busy, disabled, reason, onClose, remove }: FooterProps) {
  if (remove?.del.confirming) {
    const { del } = remove;
    return (
      <SheetFooter className="flex-col sm:flex-col sm:justify-start">
        <FeatureDeleteConfirm
          specId={remove.specId}
          title={remove.title}
          busy={del.deleting}
          onConfirm={del.confirm}
          onKeep={del.keep}
        />
      </SheetFooter>
    );
  }
  return (
    <SheetFooter className="flex-col sm:flex-col sm:justify-start md:flex-row md:justify-start">
      <Button
        type="submit"
        className="h-11 w-full md:h-9 md:w-auto"
        disabled={disabled}
        aria-busy={busy || undefined}
        aria-describedby={reason ? REASON_ID : undefined}
      >
        {busy ? "Enregistrement…" : "Enregistrer"}
      </Button>
      <Button
        type="button"
        variant="outline"
        className="h-11 w-full md:h-9 md:w-auto"
        onClick={onClose}
      >
        Fermer
      </Button>
      {remove ? (
        <FeatureDeleteTrigger
          disabled={remove.disabled}
          describedBy={remove.explained ? REASON_ID : undefined}
          onAsk={remove.del.ask}
        />
      ) : null}
    </SheetFooter>
  );
}

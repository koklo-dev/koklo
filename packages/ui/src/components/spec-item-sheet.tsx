"use client";

import { type KeyboardEvent, type ReactNode, useState } from "react";
import { Icon, type IconName } from "../icons/icon.tsx";
import { cn } from "../lib/cn.ts";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./alert-dialog.tsx";
import { Button } from "./button.tsx";
import { InlineAlert } from "./inline-alert.tsx";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "./sheet.tsx";
import { Textarea } from "./textarea.tsx";

/** Encadré « Décrire en une phrase » (création seulement). */
export type SpecItemAssist = {
  /** Exemple affiché en indication de la zone. */
  hint: string;
  value: string;
  onChange: (value: string) => void;
  onPrefill: () => void;
  /** Préremplissage en cours : bouton désactivé. */
  busy?: boolean;
  /** Raison d'un refus, annoncée sous la zone (clé absente, plafond atteint). */
  error?: ReactNode;
};

export type SpecItemSheetProps = {
  open: boolean;
  /** `create` : encadré d'aide possible ; `edit` : « Supprimer » possible. */
  mode: "create" | "edit";
  icon: IconName;
  title: ReactNode;
  subtitle: ReactNode;
  /** Identifiant de l'élément (modification) ; absent en création : il est attribué à l'enregistrement. */
  idTag?: string;
  closeLabel?: string;
  /** Saisie changée et non enregistrée : fermer demande confirmation. */
  dirty: boolean;
  /** Nom accessible de la région défilante du corps. */
  bodyLabel?: string;
  /** Fichier écrit à l'enregistrement et note de commit (pied). */
  file: string;
  commitNote: string;
  saveLabel: string;
  saving?: boolean;
  saveDisabled?: boolean;
  assist?: SpecItemAssist;
  /** Présent quand le formulaire vient d'être prérempli : bandeau « Préremplie par l'agent » et « Effacer ». */
  filled?: { onClear: () => void };
  /** Avertissement (livrable validé). */
  warning?: ReactNode;
  /** Résumé des erreurs de saisie. */
  errorSummary?: ReactNode;
  /** Texte relié au bouton principal (raison d'un bouton désactivé). */
  saveDescribedBy?: string;
  /** Ligne entre le corps et le pied (avancement, raison d'un bouton désactivé). */
  beforeFooter?: ReactNode;
  /** Remplace le pied tant qu'il est présent (confirmation de suppression). */
  confirmation?: ReactNode;
  onSave: () => void;
  onClose: () => void;
  onDelete?: () => void;
  /** Identifiant DOM du bouton « Supprimer » (retour du focus après « Garder »). */
  deleteButtonId?: string;
  /** « Supprimer » désactivé (écriture en cours) et le texte qui en donne la raison. */
  deleteDisabled?: boolean;
  deleteDescribedBy?: string;
  /** Focus à l'ouverture (par défaut : premier élément focalisable du panneau). */
  onOpenAutoFocus?: (event: Event) => void;
  /** Focus à la fermeture (par défaut : le déclencheur). */
  onCloseAutoFocus?: (event: Event) => void;
  children: ReactNode;
  className?: string;
};

function AssistBox({ assist }: { assist: SpecItemAssist }) {
  const { hint, value, onChange, onPrefill, busy, error } = assist;
  return (
    <section
      aria-label="Aide de l'agent"
      className="flex flex-col gap-2 rounded-xl border border-dashed border-primary bg-diff-bg px-3.5 py-3"
    >
      <span className="flex items-center gap-2 text-meta font-semibold">
        <Icon name="wand_stars" size={18} className="text-primary" />
        Décrire en une phrase, l'agent remplit le formulaire
      </span>
      <div className="flex items-end gap-2 rounded-[10px] border border-border bg-background py-2 pr-2 pl-3">
        <Textarea
          rows={2}
          aria-label="Description pour l'agent"
          placeholder={hint}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="min-h-0 resize-none border-0 bg-transparent px-0 py-0 focus-visible:ring-0"
        />
        <Button type="button" size="sm" className="rounded-lg" disabled={busy} onClick={onPrefill}>
          {busy ? "Préremplissage…" : "Préremplir"}
        </Button>
      </div>
      {error ? <div className="text-caption text-destructive">{error}</div> : null}
      <span className="text-caption text-muted-foreground">
        Rien n'est enregistré tant que vous n'avez pas cliqué sur « Enregistrer ».
      </span>
    </section>
  );
}

function FilledBanner({ onClear }: { onClear: () => void }) {
  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-2 rounded-[10px] border border-border bg-surface px-3 py-2.5 text-meta"
    >
      <Icon name="wand_stars" size={18} className="text-primary" />
      <span className="flex-1">
        Préremplie par l'agent. Vérifiez chaque champ marqué avant d'enregistrer.
      </span>
      <Button
        type="button"
        variant="text"
        size="xs"
        className="font-semibold text-foreground"
        onClick={onClear}
      >
        Effacer
      </Button>
    </div>
  );
}

function CloseConfirm({
  open,
  onKeep,
  onDiscard,
}: {
  open: boolean;
  onKeep: () => void;
  onDiscard: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={(next) => next || onKeep()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Fermer sans enregistrer ?</AlertDialogTitle>
          <AlertDialogDescription>
            Votre saisie n'est pas enregistrée dans la spec.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onKeep}>Continuer la saisie</AlertDialogCancel>
          <AlertDialogAction onClick={onDiscard}>Fermer sans enregistrer</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Pied sans compensation de marge (le panneau est en `px-0 py-0`) : 14 / 20 / 16 comme la maquette l.95. */
const FOOTER_BOX = "mx-0 mb-0 px-5 pt-3.5 pb-4";

function Footer(props: SpecItemSheetProps & { onAskClose: () => void }) {
  const { mode, file, commitNote, saveLabel, saving, saveDisabled, onDelete, onAskClose } = props;
  if (props.confirmation) {
    return (
      <SheetFooter className={cn(FOOTER_BOX, "flex-col items-stretch")}>
        {props.confirmation}
      </SheetFooter>
    );
  }
  return (
    <SheetFooter
      className={cn(
        FOOTER_BOX,
        "flex-col flex-nowrap items-stretch justify-start gap-2.5 max-md:sticky max-md:bottom-0",
      )}
    >
      <span className="flex flex-wrap items-center gap-2 text-caption text-muted-foreground">
        <Icon name="description" size={16} />
        <span className="font-mono">{file}</span>
        <span>· {commitNote}</span>
      </span>
      <div className="flex flex-wrap items-center gap-2">
        {mode === "edit" && onDelete ? (
          <Button
            id={props.deleteButtonId}
            disabled={props.deleteDisabled}
            aria-describedby={props.deleteDescribedBy}
            type="button"
            variant="ghost"
            icon="delete"
            className="text-muted-foreground hover:text-destructive max-md:h-11"
            onClick={onDelete}
          >
            Supprimer
          </Button>
        ) : null}
        <span className="flex-1" />
        <Button type="button" variant="outline" className="max-md:h-11" onClick={onAskClose}>
          Annuler
        </Button>
        <Button
          type="submit"
          icon="check"
          className="max-md:h-11"
          disabled={saving || saveDisabled}
          aria-busy={saving || undefined}
          aria-describedby={props.saveDescribedBy}
        >
          {saving ? "Enregistrement…" : saveLabel}
        </Button>
      </div>
    </SheetFooter>
  );
}

/** Encadré d'aide (création), bandeau « Préremplie », avertissement et résumé d'erreurs, dans cet ordre. */
function Notices(props: SpecItemSheetProps) {
  return (
    <>
      {props.mode === "create" && props.assist && !props.filled ? (
        <AssistBox assist={props.assist} />
      ) : null}
      {props.filled ? <FilledBanner onClear={props.filled.onClear} /> : null}
      {props.warning ? (
        <InlineAlert variant="warning" icon="info" role="note">
          {props.warning}
        </InlineAlert>
      ) : null}
      {props.errorSummary ? (
        <InlineAlert variant="error" icon="error">
          {props.errorSummary}
        </InlineAlert>
      ) : null}
    </>
  );
}

/** Formulaire du panneau : en-tête, région défilante (notices et corps), pied. */
function Panel(props: SpecItemSheetProps & { onAskClose: () => void }) {
  const { icon, title, subtitle, idTag, onSave } = props;
  return (
    <form
      noValidate
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(event) => {
        event.preventDefault();
        onSave();
      }}
    >
      <SheetHeader
        icon={icon}
        tag={idTag}
        tagInline
        className="items-center border-b border-border px-5 py-4 pr-16"
      >
        <SheetTitle className="text-section-title font-semibold leading-[1.3]">{title}</SheetTitle>
        <SheetDescription>{subtitle}</SheetDescription>
      </SheetHeader>
      <section
        aria-label={props.bodyLabel ?? "Saisie"}
        // biome-ignore lint/a11y/noNoninteractiveTabindex: région défilante, doit pouvoir être lue au clavier
        tabIndex={0}
        className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 pt-4 pb-5 [&>*]:shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Notices {...props} />
        {props.children}
      </section>
      {props.beforeFooter}
      <Footer {...props} />
    </form>
  );
}

/** Échap dans une liste de propositions ouverte ferme la liste seule, pas le panneau. */
const keepOpenOnListEscape = (event: KeyboardEvent | globalThis.KeyboardEvent): void => {
  if ((event.target as Element | null)?.closest?.('[aria-expanded="true"]')) event.preventDefault();
};

/**
 * Panneau d'édition d'un élément de la spec (DESIGN.md §5.14, maquette 16 l.58-108) : coque commune aux formulaires de
 * création et de modification. 540 px à droite, plein écran sous 768. Les valeurs, la validation et l'envoi restent à
 * l'appelant : le panneau ne rend que la coque (en-tête, encadré d'aide, bandeaux, corps, pied) et la confirmation de
 * fermeture quand la saisie a changé (Échap, voile, ✕ ou « Annuler »). ⌘ ou Ctrl + Entrée enregistre.
 */
export function SpecItemSheet(props: SpecItemSheetProps) {
  const [asking, setAsking] = useState(false);
  const { onSave, onClose } = props;
  const askClose = (): void => (props.dirty ? setAsking(true) : onClose());
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      onSave();
    }
  };
  return (
    <Sheet open={props.open} onOpenChange={(next) => next || askClose()}>
      <SheetContent
        size="form"
        aria-describedby={undefined}
        aria-modal="true"
        closeLabel={props.closeLabel ?? "Fermer"}
        closeClassName="top-[18px] right-5 size-8"
        className={cn(
          "gap-0 bg-background px-0 py-0 sm:max-w-none md:max-w-[540px] rounded-none max-md:border-l-0",
          props.className,
        )}
        onKeyDown={onKeyDown}
        onOpenAutoFocus={props.onOpenAutoFocus}
        onCloseAutoFocus={props.onCloseAutoFocus}
        onEscapeKeyDown={keepOpenOnListEscape}
      >
        <Panel {...props} onAskClose={askClose} />
        <CloseConfirm
          open={asking}
          onKeep={() => setAsking(false)}
          onDiscard={() => {
            setAsking(false);
            onClose();
          }}
        />
      </SheetContent>
    </Sheet>
  );
}

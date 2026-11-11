"use client";

import { Dialog as DialogPrimitive } from "radix-ui";
import type { ComponentProps } from "react";
import type { IconName } from "../icons/icon.tsx";
import { cn } from "../lib/cn.ts";
import { IconButton } from "./icon-button.tsx";
import { IconTile } from "./icon-tile.tsx";

/** Voile `--overlay` : flou et entrée sous `motion-safe` seulement (DESIGN.md §5.6). */
export const DIALOG_OVERLAY =
  "fixed inset-0 z-50 bg-overlay motion-safe:backdrop-blur-[6px] motion-safe:animate-overlay-in";

/** Panneau centré : 520 au plus, `calc(100% - 32px)` en étroit, rayon 14, `--raised`. */
export const DIALOG_PANEL =
  "fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100%-32px)] w-[calc(100%-32px)] max-w-[520px] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-dialog border border-border bg-raised shadow-dialog motion-safe:animate-content-in";

export const DIALOG_TITLE = "text-dialog-title text-foreground";
export const DIALOG_DESCRIPTION = "text-meta text-muted-foreground";

export function Dialog(props: ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root {...props} />;
}

export function DialogTrigger(props: ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger {...props} />;
}

export function DialogClose(props: ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close {...props} />;
}

export type DialogContentProps = ComponentProps<typeof DialogPrimitive.Content> & {
  closeLabel?: string;
  /** Position ou taille du bouton Fermer quand l'en-tête n'a pas la hauteur par défaut. */
  closeClassName?: string;
};

export function DialogContent({
  className,
  children,
  closeLabel = "Fermer",
  closeClassName,
  ...props
}: DialogContentProps) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay data-slot="dialog-overlay" className={DIALOG_OVERLAY} />
      <DialogPrimitive.Content className={cn(DIALOG_PANEL, className)} {...props}>
        {children}
        <DialogPrimitive.Close asChild>
          <IconButton
            icon="close"
            size="sm"
            aria-label={closeLabel}
            className={cn("absolute right-3 top-3", closeClassName)}
          />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export type DialogHeaderProps = ComponentProps<"div"> & {
  /** Tuile d'icône 36 `primary`, décorative, avant le titre. */
  icon?: IconName;
};

export function DialogHeader({ icon, className, children, ...props }: DialogHeaderProps) {
  return (
    <div className={cn("flex items-start gap-3 px-5 pb-3.5 pt-[18px]", className)} {...props}>
      {icon ? <IconTile icon={icon} size={36} tone="primary" /> : null}
      {/* Seul le titre laisse la place du bouton Fermer (32 + 12) : la description garde toute la largeur (08 l.130). */}
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 [&>[data-slot=dialog-title]]:pr-9">
        {children}
      </div>
    </div>
  );
}

export function DialogBody({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn("flex flex-col gap-4 overflow-y-auto px-5 pb-[18px]", className)}
      {...props}
    />
  );
}

export function DialogFooter({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex flex-wrap justify-end gap-2 border-t border-border bg-surface px-5 py-3.5",
        className,
      )}
      {...props}
    />
  );
}

export function DialogTitle({ className, ...props }: ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn(DIALOG_TITLE, className)}
      {...props}
    />
  );
}

export function DialogDescription({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description className={cn(DIALOG_DESCRIPTION, className)} {...props} />;
}

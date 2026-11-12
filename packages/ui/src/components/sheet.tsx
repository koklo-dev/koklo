"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { Dialog as SheetPrimitive } from "radix-ui";
import type { ComponentProps } from "react";
import type { IconName } from "../icons/icon.tsx";
import { cn } from "../lib/cn.ts";
import { DIALOG_DESCRIPTION, DIALOG_TITLE } from "./dialog.tsx";
import { IconButton } from "./icon-button.tsx";
import { IconTile } from "./icon-tile.tsx";
import { IdTag } from "./id-tag.tsx";

export function Sheet(props: ComponentProps<typeof SheetPrimitive.Root>) {
  return <SheetPrimitive.Root {...props} />;
}

export function SheetTrigger(props: ComponentProps<typeof SheetPrimitive.Trigger>) {
  return <SheetPrimitive.Trigger {...props} />;
}

export function SheetClose(props: ComponentProps<typeof SheetPrimitive.Close>) {
  return <SheetPrimitive.Close {...props} />;
}

const sheetVariants = cva(
  "fixed z-50 flex flex-col gap-4 border-border bg-raised px-5 py-4 shadow-sheet motion-safe:transition-transform duration-150 motion-safe:animate-content-in motion-reduce:transition-none",
  {
    variants: {
      side: {
        right: "inset-y-0 right-0 h-full w-full rounded-l-xl border-l",
        left: "inset-y-0 left-0 h-full w-full rounded-r-xl border-r",
        top: "inset-x-0 top-0 rounded-b-xl border-b",
        bottom: "inset-x-0 bottom-0 rounded-t-xl border-t",
      },
      /** Largeur d'un tiroir latéral ; plein écran sous 640 (DESIGN.md §5.6). */
      size: {
        detail: "",
        form: "",
        wide: "",
      },
    },
    compoundVariants: (["right", "left"] as const).flatMap((side) => [
      { side, size: "detail" as const, class: "sm:max-w-[440px]" },
      { side, size: "form" as const, class: "sm:max-w-[540px]" },
      { side, size: "wide" as const, class: "sm:max-w-[620px]" },
    ]),
    defaultVariants: { side: "right", size: "detail" },
  },
);

export type SheetContentProps = ComponentProps<typeof SheetPrimitive.Content> &
  VariantProps<typeof sheetVariants> & {
    closeLabel?: string;
    /** Position du ✕ quand l'en-tête le loge sur sa ligne (le défaut le place en haut à droite). */
    closeClassName?: string;
  };

export function SheetContent({
  side,
  size,
  className,
  children,
  closeLabel = "Fermer",
  closeClassName,
  ...props
}: SheetContentProps) {
  return (
    <SheetPrimitive.Portal>
      <SheetPrimitive.Overlay
        data-slot="sheet-overlay"
        className="fixed inset-0 z-50 bg-overlay motion-safe:animate-overlay-in"
      />
      <SheetPrimitive.Content className={cn(sheetVariants({ side, size }), className)} {...props}>
        {children}
        <SheetPrimitive.Close asChild>
          <IconButton
            icon="close"
            size={closeClassName ? "default" : "sm"}
            aria-label={closeLabel}
            className={cn("absolute right-4 top-4", closeClassName)}
          />
        </SheetPrimitive.Close>
      </SheetPrimitive.Content>
    </SheetPrimitive.Portal>
  );
}

export type SheetHeaderProps = ComponentProps<"div"> & {
  /** Tuile d'icône 36 `soft`, décorative, avant le titre. */
  icon?: IconName;
  /** Identifiant (ticket, écran) en `IdTag`, sous le sous-titre. */
  tag?: string;
  /** L'identifiant passe sur la ligne du titre, à droite, avant le ✕ (maquette 16 l.62). */
  tagInline?: boolean;
};

export function SheetHeader({
  icon,
  tag,
  tagInline = false,
  className,
  children,
  ...props
}: SheetHeaderProps) {
  return (
    <div className={cn("flex items-start gap-3 pr-10", className)} {...props}>
      {icon ? <IconTile icon={icon} size={36} tone="soft" /> : null}
      <div className={cn("flex min-w-0 flex-1 flex-col", !tagInline && "gap-1")}>
        {children}
        {tag && !tagInline ? <IdTag className="self-start">{tag}</IdTag> : null}
      </div>
      {tag && tagInline ? <IdTag className="shrink-0">{tag}</IdTag> : null}
    </div>
  );
}

/**
 * Pied `--surface` à bordure haute, collé aux bords du tiroir (compense les marges 16 / 20). Un tiroir sans marge
 * (`px-0 py-0`) annule la compensation par `mx-0 mb-0`.
 */
export function SheetFooter({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "-mx-5 -mb-4 mt-auto flex flex-wrap justify-end gap-2 border-t border-border bg-surface px-5 py-3",
        className,
      )}
      {...props}
    />
  );
}

export function SheetTitle({ className, ...props }: ComponentProps<typeof SheetPrimitive.Title>) {
  return <SheetPrimitive.Title className={cn(DIALOG_TITLE, className)} {...props} />;
}

export function SheetDescription({
  className,
  ...props
}: ComponentProps<typeof SheetPrimitive.Description>) {
  return (
    <SheetPrimitive.Description
      className={cn(DIALOG_DESCRIPTION, "text-caption font-normal", className)}
      {...props}
    />
  );
}

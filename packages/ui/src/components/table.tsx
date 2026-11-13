"use client";

import { type ComponentProps, createContext, useContext } from "react";
import { Icon } from "../icons/icon.tsx";
import { cn } from "../lib/cn.ts";

interface TableStyle {
  framed: boolean;
  stickyHeader: boolean;
}

const TableStyleContext = createContext<TableStyle>({ framed: false, stickyHeader: false });

export type TableProps = ComponentProps<"table"> & {
  /** Cadre `--border` de rayon 12 : le tableau défile dans son cadre, pas la page. */
  framed?: boolean;
  /** Texte de 12 px. */
  dense?: boolean;
  /** En-tête collant en haut du cadre. */
  stickyHeader?: boolean;
  /** Classes du cadre (hauteur maximale d'un tableau à en-tête collant, par exemple). */
  frameClassName?: string;
  /** Nom de la région défilante focusable d'un tableau encadré (« Tables du modèle de données »). */
  frameLabel?: string;
};

export function Table({
  className,
  framed = false,
  dense = false,
  stickyHeader = false,
  frameClassName,
  frameLabel,
  ...props
}: TableProps) {
  return (
    <TableStyleContext.Provider value={{ framed, stickyHeader }}>
      {/* Un cadre qui défile doit être atteignable au clavier (WCAG 2.1.1) : tabIndex seulement s'il est encadré. */}
      <div
        tabIndex={framed ? 0 : undefined}
        {...(framed && frameLabel ? { role: "region", "aria-label": frameLabel } : {})}
        className={cn(
          "relative w-full overflow-auto",
          framed &&
            "rounded-xl border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          frameClassName,
        )}
      >
        <table
          className={cn("w-full caption-bottom", dense ? "text-caption" : "text-meta", className)}
          {...props}
        />
      </div>
    </TableStyleContext.Provider>
  );
}

const FRAMED_CELL = "px-2 first:pl-4 last:pr-4";

export function TableHeader({ className, ...props }: ComponentProps<"thead">) {
  const { framed, stickyHeader } = useContext(TableStyleContext);
  return (
    <thead
      className={cn(
        "[&_tr]:border-b",
        framed && "bg-surface",
        stickyHeader && "sticky top-0 z-10 bg-surface",
        className,
      )}
      {...props}
    />
  );
}

export function TableBody({ className, ...props }: ComponentProps<"tbody">) {
  return <tbody className={cn("[&_tr:last-child]:border-0", className)} {...props} />;
}

export function TableFooter({ className, ...props }: ComponentProps<"tfoot">) {
  return (
    <tfoot
      className={cn("border-t bg-muted font-medium [&>tr]:last:border-b-0", className)}
      {...props}
    />
  );
}

export function TableRow({ className, ...props }: ComponentProps<"tr">) {
  return (
    <tr
      className={cn(
        "border-b border-border motion-safe:transition-colors duration-150 hover:bg-muted data-[state=selected]:bg-accent",
        className,
      )}
      {...props}
    />
  );
}

export function TableHead({ className, ...props }: ComponentProps<"th">) {
  const { framed } = useContext(TableStyleContext);
  return (
    <th
      className={cn(
        "text-left align-middle text-caption font-medium text-muted-foreground",
        framed ? ["py-2.5", FRAMED_CELL] : "h-10 px-3",
        className,
      )}
      {...props}
    />
  );
}

export function TableCell({ className, ...props }: ComponentProps<"td">) {
  const { framed } = useContext(TableStyleContext);
  return (
    <td
      className={cn("py-2.5 align-middle", framed ? FRAMED_CELL : "px-3", className)}
      {...props}
    />
  );
}

/** Cellule Oui / Non d'une matrice : coche `--status-validated-fg` ou tiret `--border-strong`, nommée pour les lecteurs d'écran. */
export function YesNoCell({
  value,
  className,
  ...props
}: { value: boolean } & ComponentProps<"td">) {
  return (
    <TableCell className={cn("text-center", className)} {...props}>
      <Icon
        name={value ? "check" : "remove"}
        size={18}
        aria-label={value ? "Oui" : "Non"}
        className={cn(
          "inline-block",
          value ? "text-status-validated-foreground" : "text-border-strong",
        )}
      />
    </TableCell>
  );
}

export function TableCaption({ className, ...props }: ComponentProps<"caption">) {
  return <caption className={cn("mt-4 text-meta text-muted-foreground", className)} {...props} />;
}

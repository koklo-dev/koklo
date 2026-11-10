"use client";

import { Avatar as AvatarPrimitive } from "radix-ui";
import { type ComponentProps, createContext, useContext } from "react";
import { cn } from "../lib/cn.ts";

export type AvatarSize = 24 | 28 | 32 | 36 | 40 | 56;
export type AvatarTone = "muted" | "soft" | "warning" | "agent";
export type AvatarShape = "circle" | "tile";

const BOX: Record<AvatarSize, string> = {
  24: "size-6",
  28: "size-7",
  32: "size-8",
  36: "size-9",
  40: "size-10",
  56: "size-14",
};

const TILE_RADIUS: Record<AvatarSize, string> = {
  24: "rounded-md",
  28: "rounded-lg",
  32: "rounded-lg",
  36: "rounded-card",
  40: "rounded-card",
  56: "rounded-dialog",
};

const TONE: Record<AvatarTone, string> = {
  muted: "bg-muted text-muted-foreground",
  soft: "bg-secondary text-secondary-foreground",
  warning: "bg-status-pending text-status-pending-foreground",
  agent: "bg-primary text-primary-foreground",
};

type AvatarLook = { size: AvatarSize; tone: AvatarTone; shape: AvatarShape };
const LookContext = createContext<AvatarLook>({ size: 36, tone: "muted", shape: "circle" });

const radius = ({ size, shape }: AvatarLook) =>
  shape === "tile" ? TILE_RADIUS[size] : "rounded-full";

/** Avatar (DESIGN.md §5.5) : 24 à 56 (36 par défaut), rond ou tuile, quatre tons. */
export function Avatar({
  className,
  size = 36,
  tone = "muted",
  shape = "circle",
  ...props
}: ComponentProps<typeof AvatarPrimitive.Root> & Partial<AvatarLook>) {
  const look = { size, tone, shape };
  return (
    <LookContext.Provider value={look}>
      <AvatarPrimitive.Root
        data-size={size}
        data-tone={tone}
        data-shape={shape}
        className={cn("relative flex shrink-0 overflow-hidden", BOX[size], radius(look), className)}
        {...props}
      />
    </LookContext.Provider>
  );
}

/** `alt` est obligatoire : le passer vide quand l'image double un nom déjà écrit. */
export function AvatarImage({
  className,
  alt,
  ...props
}: Omit<ComponentProps<typeof AvatarPrimitive.Image>, "alt"> & { alt: string }) {
  return (
    <AvatarPrimitive.Image
      alt={alt}
      className={cn("aspect-square size-full", className)}
      {...props}
    />
  );
}

/** Initiales : 10/600 en 24, 12/700 jusqu'à 32, 14/700 au-delà. */
export function AvatarFallback({
  className,
  ...props
}: ComponentProps<typeof AvatarPrimitive.Fallback>) {
  const look = useContext(LookContext);
  return (
    <AvatarPrimitive.Fallback
      className={cn(
        "flex size-full items-center justify-center font-bold",
        look.size === 24
          ? "text-[10px] font-semibold"
          : look.size <= 32
            ? "text-caption"
            : look.size >= 56
              ? "text-[length:var(--text-settings-title-size)]"
              : "text-body",
        radius(look),
        TONE[look.tone],
        className,
      )}
      {...props}
    />
  );
}

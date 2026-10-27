"use client";

import { Avatar as AvatarPrimitive } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "../lib/cn.ts";

export function Avatar({ className, ...props }: ComponentProps<typeof AvatarPrimitive.Root>) {
  return (
    <AvatarPrimitive.Root
      className={cn("relative flex size-9 shrink-0 overflow-hidden rounded-full", className)}
      {...props}
    />
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

export function AvatarFallback({
  className,
  ...props
}: ComponentProps<typeof AvatarPrimitive.Fallback>) {
  return (
    <AvatarPrimitive.Fallback
      className={cn(
        "flex size-full items-center justify-center rounded-full bg-muted text-[13px] font-medium text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

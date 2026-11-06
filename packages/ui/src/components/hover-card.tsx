"use client";

import { HoverCard as HoverCardPrimitive } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "../lib/cn.ts";

/**
 * Habillage d'un aperçu (DESIGN.md v2 §5.1) : `--raised`, bordure `--border`, rayon 10, marges 12 / 14 px,
 * ombre du jeton, 300 px au plus sans jamais dépasser l'écran. Exporté pour un aperçu rendu ouvert de façon
 * statique (galerie).
 */
export const hoverCardSurface =
  "w-[min(300px,calc(100vw-32px))] rounded-[10px] border bg-raised px-3.5 py-3 text-popover-foreground shadow-floating";

/** Primitive Radix : ouverture au survol et au focus, fermeture par Échap. Le toucher est ignoré. */
export function HoverCard(props: ComponentProps<typeof HoverCardPrimitive.Root>) {
  return <HoverCardPrimitive.Root {...props} />;
}

export function HoverCardTrigger(props: ComponentProps<typeof HoverCardPrimitive.Trigger>) {
  return <HoverCardPrimitive.Trigger {...props} />;
}

export function HoverCardContent({
  className,
  align = "start",
  sideOffset = 6,
  collisionPadding = 16,
  ...props
}: ComponentProps<typeof HoverCardPrimitive.Content>) {
  return (
    <HoverCardPrimitive.Portal>
      <HoverCardPrimitive.Content
        data-slot="hover-card-content"
        align={align}
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        className={cn(
          "z-50 outline-none motion-safe:animate-content-in",
          hoverCardSurface,
          className,
        )}
        {...props}
      />
    </HoverCardPrimitive.Portal>
  );
}

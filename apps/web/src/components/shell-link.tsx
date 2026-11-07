"use client";

import type { ShellLink as ShellLinkType } from "@koklo/ui";
import Link from "next/link";

/**
 * Lien du routeur pour la coquille : la barre reste montée d'une page à l'autre. Pas de préchargement : les
 * pages visées sont gardées par le proxy, une barre de vingt liens ne doit pas en lancer vingt à l'affichage.
 */
export const ShellLink: ShellLinkType = ({ href, ...props }) => (
  <Link href={href} prefetch={false} {...props} />
);

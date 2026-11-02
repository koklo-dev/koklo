import { type CanActivate, type ExecutionContext, Inject, Injectable } from "@nestjs/common";
import { ORPCError } from "@orpc/server";
import type { Request } from "express";
import type { AppConfig } from "../config.ts";
import { APP_CONFIG } from "../database/database.module.ts";

/** Valeurs de `Sec-Fetch-Site` d'une requête émise par notre propre page (ou saisie par la personne). */
const OWN_SITE_VALUES: ReadonlySet<string> = new Set(["same-origin", "none"]);

/** Lectures sans effet de bord : jamais refusées par l'origine. */
const SAFE_METHODS: ReadonlySet<string> = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Origines autorisées à écrire avec le cookie de session : l'origine publique de l'application
 * (`BETTER_AUTH_URL`, la même liste de confiance que Better Auth). Comparaison sur l'origine
 * sérialisée (schéma, hôte, port), jamais sur une sous-chaîne.
 */
export function trustedOriginsOf(config: Pick<AppConfig, "betterAuthUrl">): ReadonlySet<string> {
  return new Set([new URL(config.betterAuthUrl).origin]);
}

const single = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value.join(",") : value;

/**
 * Une écriture est acceptée si son `Origin` est exactement l'une des origines de confiance. Sans `Origin`
 * (appel serveur à serveur, outil, jeton), elle l'est aussi, sauf si le navigateur déclare une requête
 * inter-sites (`Sec-Fetch-Site`). `Origin: null` (iframe isolée, document local) est refusé.
 */
export function isTrustedWrite(headers: Request["headers"], trusted: ReadonlySet<string>): boolean {
  const origin = single(headers.origin);
  if (origin !== undefined) return trusted.has(origin);
  const site = single(headers["sec-fetch-site"]);
  return site === undefined || OWN_SITE_VALUES.has(site);
}

/**
 * Garde CSRF réutilisable (écritures seulement) pour les écritures portées par le cookie de session : 403 sans effet quand l'origine
 * n'est pas de confiance. À placer AVANT `SessionGuard` sur chaque écriture ; le refus ne répète pas l'origine reçue.
 * Appliquée aujourd'hui aux seules écritures `llmCredential.*` ; sa généralisation est un ticket à part.
 */
@Injectable()
export class OriginGuard implements CanActivate {
  private readonly trusted: ReadonlySet<string>;

  constructor(@Inject(APP_CONFIG) config: Pick<AppConfig, "betterAuthUrl">) {
    this.trusted = trustedOriginsOf(config);
  }

  canActivate(context: ExecutionContext): boolean {
    const { headers, method } = context.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(method)) return true;
    if (!isTrustedWrite(headers, this.trusted)) {
      throw new ORPCError("FORBIDDEN", { message: "Origine non autorisée" });
    }
    return true;
  }
}

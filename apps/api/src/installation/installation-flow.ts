import type { GitProvider } from "@koklo/domain";
import type { AppConfig } from "../config.ts";
import type { GitProviderBinding } from "../repo/tokens.ts";
import { createStateSigner, type StateSigner } from "./auth-state.ts";

export const INSTALLATION_FLOW = Symbol("INSTALLATION_FLOW");

/** Chemin du retour GitHub (Callback URL de l'App), relayé par le web vers l'API. */
export const CALLBACK_PATH = "/api/github/callback";

/**
 * Ce qu'il faut pour installer l'App : fournisseur, identifiants client (échange du code, URL
 * d'autorisation) et clé de signature de l'état. Tout-ou-rien : `null` si une pièce manque.
 */
export interface InstallationFlow {
  provider: GitProvider;
  clientId: string;
  redirectUri: string;
  signer: StateSigner;
}

export function installationFlowOf(
  config: AppConfig,
  provider: GitProviderBinding,
): InstallationFlow | null {
  const { githubApp, encryptionKey } = config;
  if (!provider || !githubApp?.clientId || !githubApp.clientSecret || !encryptionKey) return null;
  return {
    provider,
    clientId: githubApp.clientId,
    redirectUri: `${config.betterAuthUrl.replace(/\/+$/, "")}${CALLBACK_PATH}`,
    signer: createStateSigner(encryptionKey),
  };
}

import { isIpLiteral, isPrivateAddress } from "./ip-address.ts";

export { isPrivateAddress } from "./ip-address.ts";

export const UNSAFE_BASE_URL_REASONS = [
  "length",
  "format",
  "scheme",
  "credentials",
  "port",
  "host",
  "address",
] as const;
export type UnsafeBaseUrlReason = (typeof UNSAFE_BASE_URL_REASONS)[number];

/** Adresse de base refusée : ne reprend jamais l'adresse (elle peut contenir un secret). */
export class UnsafeBaseUrlError extends Error {
  readonly reason: UnsafeBaseUrlReason;
  constructor(reason: UnsafeBaseUrlReason) {
    super(`Adresse de base refusée : ${reason}`);
    this.name = "UnsafeBaseUrlError";
    this.reason = reason;
  }
}

export interface BaseUrlPolicy {
  /** Test seulement, posé par le code (jamais l'environnement) : autorise `http://127.0.0.1`. */
  readonly allowInsecureLoopbackForTests?: boolean;
}

/** Résout un nom en adresses (injecté : le défaut interroge le DNS, les tests un faux). */
export type HostResolver = (hostname: string) => Promise<readonly string[]>;

const MAX_LENGTH = 2048;
const FORBIDDEN_SUFFIXES = [".localhost", ".local", ".internal"] as const;
const LOOPBACK_HOST = "127.0.0.1";

const isForbiddenName = (hostname: string): boolean =>
  hostname === "localhost" ||
  hostname.endsWith(".") ||
  FORBIDDEN_SUFFIXES.some((suffix) => hostname.endsWith(suffix));

const parse = (raw: string): URL => {
  if (typeof raw !== "string" || raw.length > MAX_LENGTH) {
    throw new UnsafeBaseUrlError("length");
  }
  try {
    return new URL(raw);
  } catch {
    throw new UnsafeBaseUrlError("format");
  }
};

const isTestLoopback = (url: URL, policy: BaseUrlPolicy): boolean =>
  policy.allowInsecureLoopbackForTests === true &&
  url.protocol === "http:" &&
  url.hostname === LOOPBACK_HOST;

/**
 * Contrôle d'une adresse de base à l'enregistrement et à chaque appel : `https` seul, sans
 * identifiants, port 443, ni nom local, ni adresse privée (toutes les écritures numériques sont
 * normalisées par `URL`). Les redirections sont refusées plus loin (`redirect: "error"`).
 */
export const assertSafeBaseUrl = (raw: string, policy: BaseUrlPolicy = {}): URL => {
  const url = parse(raw);
  if (isTestLoopback(url, policy)) {
    return url;
  }
  if (url.protocol !== "https:") {
    throw new UnsafeBaseUrlError("scheme");
  }
  if (url.username !== "" || url.password !== "") {
    throw new UnsafeBaseUrlError("credentials");
  }
  if (url.port !== "") {
    throw new UnsafeBaseUrlError("port");
  }
  if (isForbiddenName(url.hostname)) {
    throw new UnsafeBaseUrlError("host");
  }
  if (isIpLiteral(url.hostname) && isPrivateAddress(url.hostname)) {
    throw new UnsafeBaseUrlError("address");
  }
  return url;
};

/**
 * Anti-rebond DNS : un nom doit résoudre uniquement vers des adresses publiques, à chaque appel.
 * Limite connue : la connexion refait sa propre résolution (voir questions.md).
 */
export const assertResolvesPublic = async (url: URL, resolve: HostResolver): Promise<void> => {
  if (isIpLiteral(url.hostname) || url.hostname === LOOPBACK_HOST) {
    return;
  }
  let addresses: readonly string[];
  try {
    addresses = await resolve(url.hostname);
  } catch {
    throw new UnsafeBaseUrlError("address");
  }
  if (addresses.length === 0 || addresses.some(isPrivateAddress)) {
    throw new UnsafeBaseUrlError("address");
  }
};

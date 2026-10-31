import { createHmac, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * `state` du flux d'installation (ADR 0009) : seul garde-fou CSRF du retour GitHub. Charge signée en
 * HMAC-SHA256 (clé dérivée de `KOKLO_ENCRYPTION_KEY` par HKDF, étiquette propre à cet usage) qui lie
 * l'état à un utilisateur, une organisation et, à la ré-autorisation, une installation. L'unicité
 * d'usage et l'expiration sont jugées par la base (`provider_auth_states`), pas par la charge.
 */
const PURPOSE = "installation-state";
const NONCE_BYTES = 18;
/** Borne de lecture : un état légitime fait moins de 400 caractères. */
const MAX_STATE_LENGTH = 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface StateClaim {
  /** Identifiant aléatoire de la ligne `provider_auth_states`. */
  nonce: string;
  userId: string;
  organizationId: string;
  /** Installation Koklo à ré-autoriser ; `null` pour une première installation. */
  installationId: string | null;
}

export interface StateSigner {
  /** Nouvel état signé (nonce frais) pour cette portée. */
  issue(scope: Omit<StateClaim, "nonce">): { state: string; nonce: string };
  /** La charge si la signature est exacte, sinon `null` (jamais d'exception, jamais de détail). */
  verify(state: string): StateClaim | null;
}

const encode = (value: Buffer | string): string => Buffer.from(value).toString("base64url");

const isString = (value: unknown): value is string => typeof value === "string";

function claimOf(payload: string): StateClaim | null {
  try {
    const raw = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Record<
      string,
      unknown
    > | null;
    const { n, u, o, i } = raw ?? {};
    if (!isString(n) || !isString(u) || !isString(o) || !UUID.test(u) || !UUID.test(o)) return null;
    if (i !== null && !(isString(i) && UUID.test(i))) return null;
    return { nonce: n, userId: u, organizationId: o, installationId: i };
  } catch {
    return null;
  }
}

export function createStateSigner(secret: Buffer): StateSigner {
  const key = Buffer.from(hkdfSync("sha256", secret, Buffer.alloc(0), PURPOSE, 32));
  const sign = (payload: string): string =>
    encode(createHmac("sha256", key).update(payload).digest());
  return {
    issue(scope) {
      const nonce = encode(randomBytes(NONCE_BYTES));
      const body = JSON.stringify({
        n: nonce,
        u: scope.userId,
        o: scope.organizationId,
        i: scope.installationId,
      });
      const payload = encode(body);
      return { state: `${payload}.${sign(payload)}`, nonce };
    },
    verify(state) {
      if (state.length > MAX_STATE_LENGTH) return null;
      const parts = state.split(".");
      const [payload, signature] = parts;
      if (parts.length !== 2 || !payload || !signature) return null;
      // Comparaison des formes encodées : le dernier caractère base64 porte des bits sans effet.
      const expected = Buffer.from(sign(payload));
      const received = Buffer.from(signature);
      if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;
      return claimOf(payload);
    },
  };
}

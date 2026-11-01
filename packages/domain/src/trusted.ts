import { TrustedInterpolationError } from "./llm-errors.ts";

/** Jeton de module : seul `trusted` peut construire un `Trusted`. */
const TOKEN = Symbol("trusted");

/** Consigne écrite par Koklo ; construite seulement par l'étiquette ``trusted`...` ``. */
export class Trusted {
  readonly #text: string;

  private constructor(token: symbol, text: string) {
    if (token !== TOKEN) {
      throw new TypeError("Trusted ne se construit que par l'étiquette trusted");
    }
    this.#text = text;
    Object.freeze(this);
  }

  static reveal(trusted: Trusted): string {
    return trusted.#text;
  }
}

const build = Trusted as unknown as new (token: symbol, text: string) => Trusted;

/** Forme exacte d'un appel d'étiquette : `strings` et `strings.raw` gelés, de même longueur. */
const isTemplateObject = (strings: unknown): boolean => {
  if (!Array.isArray(strings) || !Object.isFrozen(strings)) {
    return false;
  }
  const raw: unknown = (strings as { raw?: unknown }).raw;
  return (
    Array.isArray(raw) &&
    Object.isFrozen(raw) &&
    raw.length === strings.length &&
    strings.every((part) => typeof part === "string") &&
    raw.every((part) => typeof part === "string")
  );
};

/** Étiquette de gabarit sans interpolation : les valeurs sont typées `never`. */
export const trusted = (strings: TemplateStringsArray, ...values: never[]): Trusted => {
  if (!isTemplateObject(strings)) {
    throw new TypeError("trusted s'utilise comme étiquette de gabarit");
  }
  if (values.length > 0) {
    throw new TrustedInterpolationError();
  }
  return new build(TOKEN, strings.join(""));
};

export const revealTrusted = (value: Trusted): string => Trusted.reveal(value);

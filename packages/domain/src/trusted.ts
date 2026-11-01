/** Consigne écrite par Koklo ; construite seulement par l'étiquette ``trusted`...` `` (squelette Red). */
export class Trusted {
  readonly #text: string;
  private constructor(text: string) {
    this.#text = text;
  }
  static reveal(trusted: Trusted): string {
    void trusted.#text;
    throw new Error("non implémenté");
  }
}

/** Étiquette de gabarit sans interpolation : les valeurs sont typées `never`. */
export const trusted = (_strings: TemplateStringsArray, ..._values: never[]): Trusted => {
  throw new Error("non implémenté");
};

export const revealTrusted = (value: Trusted): string => Trusted.reveal(value);

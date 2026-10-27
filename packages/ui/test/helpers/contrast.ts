export const WCAG_AA_TEXT = 4.5;

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** Luminance relative WCAG 2.x d'une couleur `#rrggbb`. */
export function luminance(hex: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m?.[1]) throw new Error(`Couleur hex #rrggbb attendue : ${hex}`);
  const n = Number.parseInt(m[1], 16);
  return (
    0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
  );
}

/** Ratio de contraste WCAG entre deux couleurs. */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** Lève une erreur si le ratio est sous le seuil (utilisé par la suite et son cas négatif). */
export function assertContrast(label: string, fg: string, bg: string, min = WCAG_AA_TEXT): number {
  const ratio = contrastRatio(fg, bg);
  if (ratio < min) {
    throw new Error(`${label} : ${fg} / ${bg} = ${ratio.toFixed(2)}:1 < ${min}:1`);
  }
  return ratio;
}

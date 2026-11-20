import type { Fixture, FixtureRule } from "./entities/index.ts";

/**
 * Lignes générées d'un jeu d'exemple (TK-110, B485) : pure et déterministe. La ligne k (à partir de 1) est la k-ième ligne
 * stockée si k <= lignes.length, sinon la ligne produite par un PRNG mulberry32 amorcé par (graine, k) : accès direct,
 * une page coûte O(taille) quel que soit son rang. Mêmes lignes pour l'équipe et le client.
 */
type Cell = string | number | boolean;
export type FixtureRow = Record<string, Cell>;

const FIRST_NAMES = [
  "Léa",
  "Hugo",
  "Camille",
  "Louis",
  "Inès",
  "Jules",
  "Manon",
  "Nathan",
  "Chloé",
  "Arthur",
  "Sarah",
  "Lucas",
];
const LAST_NAMES = [
  "Martin",
  "Bernard",
  "Dubois",
  "Thomas",
  "Robert",
  "Richard",
  "Petit",
  "Durand",
  "Leroy",
  "Moreau",
  "Simon",
  "Laurent",
];
const EMAIL_DOMAIN = "exemple.fr";

type Random = () => number;

/** mulberry32 : suite uniforme dans [0, 1) pour une amorce 32 bits. */
function mulberry32(seed: number): Random {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Amorce de la ligne k : mélange de (graine, k), chaque rang a sa propre suite. */
const seedOf = (seed: number, rank: number): number =>
  Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(rank + 0x7f4a7c15, 0xc2b2ae35);

const pick = <T>(items: readonly T[], random: Random): T =>
  items[Math.floor(random() * items.length)] as T;

const ascii = (value: string): string => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Jours depuis 1970-01-01 d'une date civile (calendrier grégorien proleptique, sans `Date`). */
function daysFromCivil(year: number, month: number, day: number): number {
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yearOfEra = y - era * 400;
  const dayOfYear = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1;
  const dayOfEra =
    yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear;
  return era * 146097 + dayOfEra - 719468;
}

/** Date civile `AAAA-MM-JJ` d'un nombre de jours depuis 1970-01-01. */
function civilFromDays(days: number): string {
  const shifted = days + 719468;
  const era = Math.floor(shifted / 146097);
  const dayOfEra = shifted - era * 146097;
  const yearOfEra = Math.floor(
    (dayOfEra -
      Math.floor(dayOfEra / 1460) +
      Math.floor(dayOfEra / 36524) -
      Math.floor(dayOfEra / 146096)) /
      365,
  );
  const dayOfYear =
    dayOfEra - (365 * yearOfEra + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100));
  const mp = Math.floor((5 * dayOfYear + 2) / 153);
  const day = dayOfYear - Math.floor((153 * mp + 2) / 5) + 1;
  const month = mp < 10 ? mp + 3 : mp - 9;
  const year = yearOfEra + era * 400 + (month <= 2 ? 1 : 0);
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** `start` (AAAA-MM-JJ) décalée de `offset` jours. */
function isoDay(start: string, offset: number): string {
  const [year = 1970, month = 1, day = 1] = start.split("-").map(Number);
  return civilFromDays(daysFromCivil(year, month, day) + offset);
}

function cellOf(rule: FixtureRule, rank: number, random: Random): Cell {
  switch (rule.type) {
    case "sequence": {
      const value = (rule.debut ?? 1) + rank - 1;
      return rule.prefixe === undefined ? value : `${rule.prefixe}${value}`;
    }
    case "choix":
      return pick(rule.valeurs, random);
    case "entier":
      return rule.min + Math.floor(random() * (rule.max - rule.min + 1));
    case "date":
      return isoDay(rule.debut, Math.floor(random() * (rule.jours + 1)));
    case "nom":
      return `${pick(FIRST_NAMES, random)} ${pick(LAST_NAMES, random)}`;
    case "email":
      return `${ascii(pick(FIRST_NAMES, random))}.${ascii(pick(LAST_NAMES, random))}${rank}@${EMAIL_DOMAIN}`;
  }
}

/** Nombre de lignes du jeu : `generation.total`, sinon les lignes stockées. */
export const fixtureRowCount = (fixture: Fixture): number =>
  fixture.generation?.total ?? fixture.lignes.length;

/** Ligne de rang k (à partir de 1) ; `undefined` au-delà du jeu. */
export function generateFixtureRow(fixture: Fixture, rank: number): FixtureRow | undefined {
  if (!Number.isInteger(rank) || rank < 1 || rank > fixtureRowCount(fixture)) return undefined;
  const stored = fixture.lignes[rank - 1];
  if (stored !== undefined) return { ...stored };
  const generation = fixture.generation;
  if (generation === undefined) return undefined;
  const random = mulberry32(seedOf(generation.graine, rank));
  return Object.fromEntries(
    Object.keys(generation.regles).map((field) => [
      field,
      cellOf(generation.regles[field] as FixtureRule, rank, random),
    ]),
  );
}

/** Page `page` (à partir de 1) de `size` lignes ; vide au-delà de la fin. */
export function generateFixturePage(fixture: Fixture, page: number, size: number): FixtureRow[] {
  const first = (page - 1) * size + 1;
  const last = Math.min(first + size - 1, fixtureRowCount(fixture));
  const rows: FixtureRow[] = [];
  for (let rank = first; rank <= last; rank++) {
    const row = generateFixtureRow(fixture, rank);
    if (row !== undefined) rows.push(row);
  }
  return rows;
}

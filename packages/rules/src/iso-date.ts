const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME = /^T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?$/;
const THIRTY_DAYS = [4, 6, 9, 11];

const isLeapYear = (year: number): boolean =>
  year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);

const daysIn = (year: number, month: number): number => {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return THIRTY_DAYS.includes(month) ? 30 : 31;
};

/** `YYYY-MM-DD` d'un vrai jour du calendrier grégorien. */
export const isIsoDay = (value: string): boolean => {
  const match = DAY.exec(value);
  if (match === null) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  return month >= 1 && month <= 12 && day >= 1 && day <= daysIn(year, month);
};

/** Jour (`YYYY-MM-DD`) d'une date ISO ou date-heure ISO ; `undefined` si invalide. */
export const dayOfIso = (value: string): string | undefined => {
  const day = value.slice(0, 10);
  const rest = value.slice(10);
  return isIsoDay(day) && (rest === "" || TIME.test(rest)) ? day : undefined;
};

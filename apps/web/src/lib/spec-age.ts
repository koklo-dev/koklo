const RTF = new Intl.RelativeTimeFormat("fr", { numeric: "always" });
const MINUTE = 60_000;

/** Âge de la spec pour l'en-tête (« il y a 3 minutes ») ; moins d'une minute : « à l'instant ». */
export function ageOf(iso: string, now = Date.now()): string {
  const elapsed = Math.max(0, now - new Date(iso).getTime());
  const minutes = Math.floor(elapsed / MINUTE);
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return RTF.format(-minutes, "minute");
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return RTF.format(-hours, "hour");
  return RTF.format(-Math.floor(hours / 24), "day");
}

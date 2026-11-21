import { parse } from "yaml";

/** Libellé et icône des zones d'un dossier (modèle de données TK-110, B484 ; architecture TK-111) : hors modèle, `kindOf` l'ignore, jamais indexé. */
export const ZONES_PATH = "data/_zones.yaml";
/** Zones et acteurs de l'architecture (TK-111, B513) : tolérants comme `data/_zones.yaml`, hors modèle, jamais indexés. */
export const ARCH_ZONES_PATH = "architecture/_zones.yaml";
export const ARCH_ACTORS_PATH = "architecture/actors.yaml";
export const ZONE_ICON_DEFAULT = "folder_open";
export const ZONE_NAME_MAX = 80;
const ICON = /^[a-z][a-z0-9_]{0,63}$/;

export interface ZoneStyle {
  nom: string;
  icone: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function zoneOf(entry: unknown): ZoneStyle | undefined {
  if (!isRecord(entry)) return undefined;
  const { nom, icone } = entry;
  if (typeof nom !== "string" || nom === "" || nom.length > ZONE_NAME_MAX) return undefined;
  return { nom, icone: typeof icone === "string" && ICON.test(icone) ? icone : ZONE_ICON_DEFAULT };
}

/** Relit `data/_zones.yaml`, tolérant : une entrée illisible est écartée ; seul un YAML illisible est refusé. */
export function parseZones(
  text: string,
): { ok: true; zones: ZoneStyle[] } | { ok: false; message: string } {
  let raw: unknown;
  try {
    raw = parse(text);
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "YAML illisible" };
  }
  const entries = isRecord(raw) && Array.isArray(raw.zones) ? raw.zones : [];
  return { ok: true, zones: entries.flatMap((entry) => zoneOf(entry) ?? []) };
}

import { stringify } from "yaml";
import type { Endpoint } from "../entities/index.ts";
import { compare } from "../issue.ts";
import type { Parsed } from "../types.ts";
import { deleteOf, type MigrationResult, writeOf } from "./types.ts";

const VERBS: Record<Endpoint["methode"], string> = {
  GET: "lister",
  POST: "creer",
  PUT: "modifier",
  PATCH: "modifier",
  DELETE: "supprimer",
};

const slugify = (text: string): string =>
  text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/** Premier segment du chemin sans accolade, en slug ; `api` quand le chemin n'en a aucun. */
export function zoneOfPath(chemin: string): string {
  const segment = chemin.split("/").find((part) => part !== "" && !part.includes("{"));
  return (segment === undefined ? "" : slugify(segment)) || "api";
}

export function verbOf(endpoint: Pick<Endpoint, "methode" | "chemin">): string {
  if (endpoint.methode === "GET" && endpoint.chemin.includes("{")) return "lire";
  return VERBS[endpoint.methode];
}

/** Ancien identifiant -> nouvel identifiant `zone.verbe`, plus les fichiers à écrire et à supprimer. */
export interface EndpointMigration extends MigrationResult {
  readonly ids: Map<string, string>;
}

/** Réécrit les endpoints `E-<slug>` en `<zone>.<verbe>` ; une collision prend le suffixe `-2`, `-3`, dans l'ordre des anciens identifiants. */
export function planEndpoints(endpoints: readonly Parsed<Endpoint>[]): EndpointMigration {
  const ids = new Map<string, string>();
  const taken = new Set(endpoints.map((e) => e.value.id).filter((id) => !id.startsWith("E-")));
  const result: EndpointMigration = { changes: [], issues: [], ids };
  const legacy = endpoints
    .filter((e) => e.value.id.startsWith("E-"))
    .sort((a, b) => compare(a.value.id, b.value.id));
  for (const { path, value } of legacy) {
    const zone = zoneOfPath(value.chemin);
    const base = `${zone}.${verbOf(value)}`;
    let id = base;
    for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
    taken.add(id);
    ids.set(value.id, id);
    const target = `api/endpoints/${id}.yaml`;
    const { id: _old, zone: _zone, ...rest } = value;
    result.changes.push(
      deleteOf(path),
      writeOf(target, stringify({ id, zone, ...rest }, { lineWidth: 0 })),
    );
  }
  return result;
}

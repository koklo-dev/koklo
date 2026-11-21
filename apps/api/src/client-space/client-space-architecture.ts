import type {
  AdrDetail,
  ArchflowDetail,
  ClientArchitectureComponent,
  ClientSpaceAdr,
  ClientSpaceArchFlow,
} from "@koklo/contract";
import { COMPONENT_TYPES } from "@koklo/schema";
import { isRecord, list, text, texts } from "../spec-read/entity-values.ts";

/**
 * Architecture vue du client (TK-113, B575 à B592) : nom, type, zone, phrases `resume_client`, fonctionnalités servies par
 * libellé, dépendances par nom et moyen ; décisions avec leur « En clair » ; flux en séquence. La responsabilité technique, les
 * tables possédées, les décisions citées, les chemins et les SHA ne sortent jamais. Lecture tolérante : une donnée absente ou
 * d'un autre type reprend sa valeur neutre.
 */
type Json = Record<string, unknown>;
const FEATURE = /^F-\d{3,}$/;
const COMPONENT = /^C-[a-z0-9][a-z0-9-]*$/;
const record = (value: unknown): Json => (isRecord(value) ? value : {});

/** Libellés des fonctionnalités (`F-nnn`) et noms des composants (`C-slug`) cités : un amont absent de l'index n'y figure pas. */
export interface ClientArchitectureNames {
  labels: ReadonlyMap<string, string>;
  names: ReadonlyMap<string, string>;
}

const dependsOnOf = (data: Json, names: ReadonlyMap<string, string>) =>
  list(data.depend_de).flatMap((entry) => {
    const dependency = record(entry);
    const to = text(dependency.vers);
    const name = names.get(to);
    if (!COMPONENT.test(to) || name === undefined) return [];
    return [
      {
        id: to,
        name,
        via: text(dependency.via),
        ...(dependency.mode === "asynchrone" ? { async: true } : {}),
      },
    ];
  });

/** `F-nnn` cités par `sert` : les fonctionnalités que le composant sert, par libellé (jamais l'identifiant seul). */
const servesOf = (data: Json, labels: ReadonlyMap<string, string>) =>
  texts(data.sert)
    .filter((id) => FEATURE.test(id) && labels.has(id))
    .map((id) => ({ id, label: labels.get(id) as string }));

export function clientComponentOf(
  specId: string,
  data: unknown,
  { labels, names }: ClientArchitectureNames,
): ClientArchitectureComponent {
  const json = record(data);
  const type = COMPONENT_TYPES.find((known) => known === json.type) ?? "app";
  const zone = text(json.zone);
  return {
    id: specId,
    name: text(json.nom) || text(json.titre) || specId,
    type,
    ...(zone === "" ? {} : { zone }),
    summary: texts(json.resume_client),
    serves: servesOf(json, labels),
    dependsOn: dependsOnOf(json, names),
  };
}

/** Fiche de la décision au vocabulaire du client : sans liens, chemin ni SHA. */
export function clientAdrOf(detail: AdrDetail): ClientSpaceAdr {
  const { specId, links: _links, filePath: _filePath, commitSha: _commitSha, ...rest } = detail;
  return { id: specId, ...rest };
}

/** Séquence d'un flux sans chemin, SHA ni décisions citées. */
export function clientArchFlowOf(detail: ArchflowDetail): ClientSpaceArchFlow {
  const { filePath: _filePath, commitSha: _commitSha, decisions: _decisions, ...rest } = detail;
  return rest;
}

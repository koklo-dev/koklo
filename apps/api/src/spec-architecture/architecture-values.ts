import type {
  ArchitectureComponentSummary,
  ArchitectureDocSection,
  ComponentDetail,
} from "@koklo/contract";
import { slugOf } from "@koklo/domain";
import {
  type ArchitectureInput,
  COMPONENT_TYPES,
  type Component,
  type ComponentType,
  docSectionSlugOf,
  parseDocSection,
} from "@koklo/schema";
import { isRecord, list, text, texts } from "../spec-read/entity-values.ts";

/**
 * Lecture tolérante des composants de l'index d'entités (`spec_entities.data`, TK-111) : ce que le worker écrit depuis
 * `architecture/components/<slug>.yaml`, plus `titre`. Rien n'est supposé : un champ absent ou d'un autre type reprend sa
 * valeur neutre, jamais une exception. Aucun YAML ni Mermaid ne sort d'ici.
 */
type Json = Record<string, unknown>;

const TABLE = /^T-[a-z0-9][a-z0-9-]*$/;
const FEATURE = /^F-\d{3,}$/;
const COMPONENT = /^C-[a-z0-9][a-z0-9-]*$/;
const ADR = /^ADR-\d{3,}$/;

const record = (value: unknown): Json => (isRecord(value) ? value : {});
const matching = (value: unknown, pattern: RegExp): string[] =>
  texts(value).filter((id) => pattern.test(id));
const typeOf = (value: unknown): ComponentType =>
  COMPONENT_TYPES.find((type) => type === value) ?? "app";

/** Nom d'un composant : `nom`, sinon `titre` de l'index, sinon l'identifiant. */
const nameOf = (specId: string, data: Json): string => text(data.nom) || text(data.titre) || specId;

function dependenciesOf(data: Json): ComponentDetail["dependsOn"] {
  return list(data.depend_de).flatMap((entry) => {
    const dependency = record(entry);
    const to = text(dependency.vers);
    const via = text(dependency.via);
    if (!COMPONENT.test(to) || via === "") return [];
    return [{ to, via, ...(dependency.mode === "asynchrone" ? { async: true } : {}) }];
  });
}

/** Composant vu par le schéma : lecture tolérante, la zone absente reste `undefined`. */
export interface ComponentNode {
  id: string;
  name: string;
  type: ComponentType;
  zone: string | undefined;
  responsibility: string;
  dependsOn: { to: string; via: string; async: boolean }[];
}

export function componentNode(specId: string, data: unknown): ComponentNode {
  const json = record(data);
  return {
    id: specId,
    name: nameOf(specId, json),
    type: typeOf(json.type),
    zone: text(json.zone) || undefined,
    responsibility: text(json.responsabilite).split("\n", 1)[0] ?? "",
    dependsOn: dependenciesOf(json).map(({ to, via, async }) => ({
      to,
      via,
      async: async === true,
    })),
  };
}

/** Ligne du tableau Composants : première ligne de la responsabilité, nombre de dépendances. */
export function componentSummary(
  specId: string,
  path: string,
  data: unknown,
): ArchitectureComponentSummary {
  const json = record(data);
  return {
    specId,
    name: nameOf(specId, json),
    type: typeOf(json.type),
    zone: text(json.zone),
    responsibility: text(json.responsabilite).split("\n", 1)[0] ?? "",
    dependsOnCount: list(json.depend_de).length,
    decisions: matching(json.decisions, ADR),
    filePath: path,
  };
}

/** Fiche d'un composant pour le panneau d'édition (`spec.item.get`). */
export function componentDetail(
  specId: string,
  data: unknown,
  where: { filePath: string; commitSha: string },
): ComponentDetail {
  const json = record(data);
  const summary = texts(json.resume_client);
  return {
    specId,
    name: nameOf(specId, json),
    type: typeOf(json.type),
    zone: text(json.zone),
    responsibility: text(json.responsabilite),
    owns: matching(json.possede, TABLE),
    serves: matching(json.sert, FEATURE),
    dependsOn: dependenciesOf(json),
    decisions: matching(json.decisions, ADR),
    ...(summary.length === 0 ? {} : { clientSummary: summary }),
    filePath: where.filePath,
    commitSha: where.commitSha,
  };
}

/** Au plus 100 sections lues : le document d'une spec en compte une douzaine, le plafond protège le fournisseur. */
export const DOC_SECTIONS_MAX = 100;

/** Chemin (relatif à la spec) d'une section du document. */
export const isDocSectionPath = (path: string): boolean => docSectionSlugOf(path) !== undefined;

/** Sections du document (`architecture/overview/NN-<slug>.md`), dans l'ordre de leur numéro ; hors format : ignoré. */
export function docSectionsOf(
  files: readonly { path: string; content: string }[],
): ArchitectureDocSection[] {
  return files
    .flatMap((file) => {
      const found = docSectionSlugOf(file.path);
      if (found === undefined) return [];
      const section = parseDocSection(file.content);
      return [
        {
          specId: `DOC-${found.slug}`,
          slug: found.slug,
          num: found.num,
          path: file.path,
          title: section.title || found.slug,
          status: section.status,
          markdown: section.markdown,
          updatedAt: null,
          lastAuthor: null,
        },
      ];
    })
    .sort((a, b) => a.num - b.num || (a.slug < b.slug ? -1 : 1));
}

/** Composant d'une proposition en attente : l'identifiant que le serveur attribuera (`C-<slug du nom>`) ; `undefined` si illisible. */
export function pendingComponent(payload: unknown): Component | undefined {
  const json = record(payload);
  const name = text(json.name);
  const type = COMPONENT_TYPES.find((value) => value === json.type);
  if (name === "" || type === undefined) return undefined;
  return {
    id: `C-${slugOf(name, "composant")}`,
    nom: name,
    type,
    zone: text(json.zone),
    responsabilite: text(json.responsibility),
    possede: matching(json.owns, TABLE),
    sert: matching(json.serves, FEATURE),
    depend_de: list(json.dependsOn).flatMap((entry) => {
      const dependency = record(entry);
      const to = text(dependency.to);
      const via = text(dependency.via);
      if (!COMPONENT.test(to) || via === "") return [];
      return [
        { vers: to, via, ...(dependency.async === true ? { mode: "asynchrone" as const } : {}) },
      ];
    }),
    decisions: matching(json.decisions, ADR),
  };
}

/** Composant d'une proposition ; celle qui met à jour un composant indexé (`specId`, B615) en garde l'identifiant. */
function proposedComponent(payload: unknown): Component | undefined {
  const component = pendingComponent(payload);
  const specId = specIdOf(payload);
  return component && specId ? { ...component, id: specId } : component;
}

const specIdOf = (payload: unknown): string | undefined => {
  const specId = record(payload).specId;
  return typeof specId === "string" && COMPONENT.test(specId) ? specId : undefined;
};

interface ChecksFacts {
  features: readonly string[];
  tables: readonly string[];
  flows: readonly string[];
  components: readonly { specId: string; data: unknown }[];
  archflows: readonly string[];
  pending: readonly { kind: string; payload: unknown }[];
}

const entry = <T>(value: T): { path: string; value: T } => ({ path: "", value });

/** Entrée des avertissements : l'index de tête plus les composants et flux des propositions en attente (B511). */
export function checksInputOf(facts: ChecksFacts): ArchitectureInput & {
  components: { path: string; value: Component }[];
} {
  const indexed = facts.components.flatMap(({ specId, data }) => {
    const json = record(data);
    const component = pendingComponent({
      name: nameOf(specId, json),
      type: json.type,
      zone: json.zone,
      responsibility: json.responsabilite,
      owns: json.possede,
      serves: json.sert,
      dependsOn: list(json.depend_de).map((item) => ({
        to: record(item).vers,
        via: record(item).via,
        async: record(item).mode === "asynchrone",
      })),
      decisions: json.decisions,
    });
    return component === undefined ? [] : [{ ...component, id: specId }];
  });
  const pendingComponents = facts.pending.filter((item) => item.kind === "component");
  const proposed = pendingComponents.flatMap((item) => proposedComponent(item.payload) ?? []);
  // Une proposition `specId` (B615) remplace le composant indexé : ses liens sont l'index ∪ ajouts.
  const replaced = new Set(pendingComponents.flatMap((item) => specIdOf(item.payload) ?? []));
  const flows = new Set(facts.archflows);
  for (const item of facts.pending) {
    const flow = item.kind === "archflow" ? text(record(item.payload).flow) : "";
    if (flow !== "") flows.add(flow);
  }
  const ids = (list: readonly string[]) => list.map((id) => entry({ id }));
  return {
    features: ids(facts.features),
    tables: ids(facts.tables),
    flows: ids(facts.flows),
    components: [...indexed.filter((c) => !replaced.has(c.id)), ...proposed].map(entry),
    archFlows: ids([...flows]),
  };
}

import type { Adr, ArchFlow, Component } from "../entities/index.ts";
import type { Issue, ParsedSpec } from "../types.ts";
import type { SpecIndex } from "./index.ts";
import { checkLinks, type Emit, emitterFor } from "./rule4-links.ts";

type Links = Parameters<typeof checkLinks>[0];

/** Liens F-, R-, ADR- partagés par les composants, les flux et les décisions. */
const decisionLinks = (
  items: readonly string[],
  base: string,
  index: SpecIndex,
): Links[number] => ({
  items,
  base,
  known: index.adrs,
  code: "ARCH_UNKNOWN_DECISION",
  label: "La décision",
});

function checkComponent(component: Component, index: SpecIndex, emit: Emit): void {
  checkLinks(
    [
      {
        items: component.possede,
        base: "/possede",
        known: index.tables,
        code: "ARCH_UNKNOWN_TABLE",
        label: "La table",
      },
      {
        items: component.sert,
        base: "/sert",
        known: index.features,
        code: "ARCH_UNKNOWN_FEATURE",
        label: "La fonctionnalité",
      },
      {
        items: component.acteurs,
        base: "/acteurs",
        known: index.roles,
        code: "R4_UNKNOWN_ROLE",
        label: "Le rôle",
      },
      decisionLinks(component.decisions, "/decisions", index),
    ],
    emit,
  );
  component.depend_de.forEach((dependency, i) => {
    if (index.components.has(dependency.vers)) return;
    emit(
      "ARCH_UNKNOWN_COMPONENT",
      `/depend_de/${i}/vers`,
      `Le composant ${dependency.vers} n'existe pas.`,
    );
  });
}

function checkFlow(flow: ArchFlow, index: SpecIndex, emit: Emit): void {
  if (!index.flows.has(flow.id)) {
    emit(
      "ARCH_UNKNOWN_FLOW",
      "/id",
      `Le parcours ${flow.id} n'existe pas : un flux technique détaille un parcours métier.`,
    );
  }
  flow.participants.forEach((id, i) => {
    if (!id.startsWith("C-") || index.components.has(id)) return;
    emit("ARCH_UNKNOWN_COMPONENT", `/participants/${i}`, `Le composant ${id} n'existe pas.`);
  });
  checkLinks(
    [
      {
        items: flow.fonctionnalites,
        base: "/fonctionnalites",
        known: index.features,
        code: "ARCH_UNKNOWN_FEATURE",
        label: "La fonctionnalité",
      },
      {
        items: flow.regles,
        base: "/regles",
        known: index.rules,
        code: "ARCH_UNKNOWN_RULE",
        label: "La règle",
      },
      decisionLinks(flow.decisions, "/decisions", index),
    ],
    emit,
  );
}

/** Cible d'un lien de décision d'après son préfixe : F-, T-, C-, R- ou P-. */
function adrTarget(id: string, index: SpecIndex): Pick<Links[number], "known" | "code" | "label"> {
  if (id.startsWith("T-"))
    return { known: index.tables, code: "ARCH_UNKNOWN_TABLE", label: "La table" };
  if (id.startsWith("C-"))
    return { known: index.components, code: "ARCH_UNKNOWN_COMPONENT", label: "Le composant" };
  if (id.startsWith("R-"))
    return { known: index.rules, code: "ARCH_UNKNOWN_RULE", label: "La règle" };
  if (id.startsWith("P-"))
    return { known: index.flows, code: "ARCH_UNKNOWN_FLOW", label: "Le parcours" };
  return { known: index.features, code: "ARCH_UNKNOWN_FEATURE", label: "La fonctionnalité" };
}

function checkAdr(adr: Adr, index: SpecIndex, emit: Emit): void {
  adr.liens.forEach((id, i) => {
    const { known, code, label } = adrTarget(id, index);
    if (!known.has(id)) emit(code, `/liens/${i}`, `${label} ${id} n'existe pas.`);
  });
  if (adr.remplacee_par !== undefined && !index.adrs.has(adr.remplacee_par)) {
    emit(
      "ARCH_UNKNOWN_DECISION",
      "/remplacee_par",
      `La décision ${adr.remplacee_par} n'existe pas.`,
    );
  }
}

/**
 * Règle 4 appliquée à l'architecture (TK-111) : les références d'un composant, d'un flux technique et d'une décision pointent vers une table, une
 * fonctionnalité, un composant, une règle, une décision ou un parcours existants. Erreurs `ARCH_UNKNOWN_*`, vérifiées à
 * l'enregistrement. Les avertissements d'architecture (jamais bloquants) sont dans `architectureChecks`.
 */
export function checkRule8(spec: ParsedSpec, index: SpecIndex): Issue[] {
  const out: Issue[] = [];
  const at = (path: string, id: string) => emitterFor(out, path, id);
  for (const { path, value } of spec.components) checkComponent(value, index, at(path, value.id));
  for (const { path, value } of spec.archFlows) checkFlow(value, index, at(path, value.id));
  for (const { path, value } of spec.adrs) checkAdr(value, index, at(path, value.id));
  return out;
}

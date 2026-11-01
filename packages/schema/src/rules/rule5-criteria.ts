import type { Criterion, Feature } from "../entities/index.ts";
import { ruleIssue } from "../issue.ts";
import type { Issue } from "../types.ts";

type Role = "etant_donne" | "quand" | "alors";

const ROLE_ORDER: Record<Role, number> = { etant_donne: 0, quand: 1, alors: 2 };
const ROLE_LABEL: Record<Role, string> = {
  etant_donne: "Étant donné",
  quand: "Quand",
  alors: "Alors",
};
const ROLES = Object.keys(ROLE_ORDER) as Role[];

type Fault = { pointer: string; reason: string };

/** Première faute d'un critère : étape mal placée, sinon rôle manquant ; `undefined` si complet. */
function firstFault(c: Criterion, base: string): Fault | undefined {
  const seen = new Set<Role>();
  let role: Role | undefined;
  for (const [j, step] of c.etapes.entries()) {
    const effective = step.type === "et" ? role : step.type;
    if (effective === undefined) {
      return { pointer: `${base}/${j}`, reason: "une étape « Et » ne suit aucune autre étape" };
    }
    if (role !== undefined && ROLE_ORDER[effective] < ROLE_ORDER[role]) {
      const reason = `l'étape « ${ROLE_LABEL[effective]} » suit une étape « ${ROLE_LABEL[role]} »`;
      return { pointer: `${base}/${j}`, reason };
    }
    role = effective;
    seen.add(effective);
  }
  const missing = ROLES.filter((r) => !seen.has(r)).map((r) => ROLE_LABEL[r]);
  if (missing.length === 0) return undefined;
  return { pointer: base, reason: `étape manquante : ${missing.join(", ")}` };
}

/** Contrôle strict dès `specifiee` : une issue par critère incomplet ou mal ordonné. */
export function checkCriteriaSteps(path: string, f: Feature): Issue[] {
  if (f.statut === "brouillon") return [];
  return f.criteres.flatMap((c, i) => {
    const fault = firstFault(c, `/criteres/${i}/etapes`);
    if (!fault) return [];
    const message = `Le critère ${c.id} de la feature ${f.id} est incomplet ou mal ordonné (${fault.reason}) ; l'ordre attendu est Étant donné, Quand, Alors.`;
    return [ruleIssue(5, "R5_CRITERION_INCOMPLETE", path, fault.pointer, f.id, message)];
  });
}

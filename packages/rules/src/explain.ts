import type { Enforcement } from "./catalog-types.ts";
import type { EffectiveRule } from "./layer-types.ts";
import type { Resolution } from "./resolve-types.ts";

const enforcementText = (enforcement: Enforcement): string =>
  enforcement.kind === "gate" ? `gate/${enforcement.adapter}` : enforcement.kind;

const ruleLines = (rule: EffectiveRule): string[] => [
  `[${rule.severity.toUpperCase()}] ${rule.id} — ${rule.title} (${rule.origin === "catalog" ? "framework" : rule.origin})`,
  `  ${rule.description}`,
  `  enforcement: ${enforcementText(rule.enforcement)}`,
];

/** Texte identique au `explain` de engineering-rules.sh (sans saut de ligne final), suivi des conflits. */
export const renderExplanation = (resolution: Resolution): string => {
  const lines = [
    `Agent: ${resolution.role}`,
    `Scope: ${resolution.path}`,
    `Profiles: ${resolution.profiles.join(", ")}`,
    "",
    ...resolution.rules.flatMap(ruleLines),
  ];
  if (resolution.conflicts.length > 0) {
    lines.push("", "Conflicts:");
    for (const c of resolution.conflicts) {
      lines.push(`  ${c.level} ${c.ruleId}: ${c.attempted} refused (${c.reason})`);
    }
  }
  return lines.join("\n").trimEnd();
};

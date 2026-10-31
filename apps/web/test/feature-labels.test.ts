import { existsSync } from "node:fs";
import { join } from "node:path";
import { featurePrioritySchema, featureStatusSchema, stepTypeSchema } from "@koklo/contract";
import { describe, expect, it } from "vitest";
import {
  criteriaLabel,
  priorityLabel,
  statusIcon,
  statusLabel,
  stepLabel,
} from "../src/lib/feature-labels.ts";

/** TK-48 / 48d : libellés, icônes de statut et de priorité (design/screens/S-features.md §3.3, §3.4). */
const ICONS = join(import.meta.dirname, "../../../packages/ui/src/icons/generated");

describe("statusLabel / statusIcon", () => {
  it.each([
    ["brouillon", "Brouillon", "edit_note"],
    ["specifiee", "Spécifiée", "fact_check"],
    ["implementee", "Implémentée", "task_alt"],
    ["adoptee", "Adoptée", "check_circle"],
  ])("%s : « %s » avec l'icône %s", (status, label, icon) => {
    expect(statusLabel(status)).toBe(label);
    expect(statusIcon(status)).toBe(icon);
  });

  it("couvre exactement les valeurs du contrat (une entrée par valeur)", () => {
    for (const value of featureStatusSchema.options) {
      expect(statusLabel(value)).not.toBe(value);
      expect(statusLabel(value).length).toBeGreaterThan(0);
    }
  });

  it("les icônes existent dans la bibliothèque @koklo/ui (aucune icône nouvelle)", () => {
    for (const value of featureStatusSchema.options) {
      expect(existsSync(join(ICONS, `${statusIcon(value)}.ts`)), statusIcon(value)).toBe(true);
    }
  });

  it("une valeur inconnue n'est jamais rendue brute", () => {
    expect(statusLabel("zzz_inconnu")).not.toContain("zzz_inconnu");
    expect(statusLabel("zzz_inconnu").length).toBeGreaterThan(0);
    expect(existsSync(join(ICONS, `${statusIcon("zzz_inconnu")}.ts`))).toBe(true);
  });
});

describe("priorityLabel", () => {
  it.each([
    ["must", "Indispensable"],
    ["should", "Importante"],
    ["could", "Souhaitable"],
    ["wont", "Reportée"],
  ])("%s : « %s »", (priority, label) => {
    expect(priorityLabel(priority)).toBe(label);
  });

  it("aucune valeur du contrat n'est rendue brute, l'inconnue non plus", () => {
    for (const value of featurePrioritySchema.options) expect(priorityLabel(value)).not.toBe(value);
    expect(priorityLabel("zzz_inconnu")).not.toContain("zzz_inconnu");
  });

  it("pas de jargon MoSCoW dans les libellés", () => {
    for (const value of featurePrioritySchema.options) {
      expect(priorityLabel(value)).not.toMatch(/must|should|could|won'?t|moscow/i);
    }
  });
});

describe("stepLabel", () => {
  it.each([
    ["etant_donne", "Étant donné"],
    ["quand", "Quand"],
    ["alors", "Alors"],
    ["et", "Et"],
  ])("%s : « %s »", (type, label) => {
    expect(stepLabel(type)).toBe(label);
  });

  it("couvre le contrat, l'inconnue n'est pas rendue brute", () => {
    for (const value of stepTypeSchema.options) expect(stepLabel(value).length).toBeGreaterThan(0);
    expect(stepLabel("zzz_inconnu")).not.toContain("zzz_inconnu");
  });
});

describe("criteriaLabel", () => {
  it.each([
    [0, "0 critère"],
    [1, "1 critère"],
    [2, "2 critères"],
    [12, "12 critères"],
  ])("%i : « %s »", (count, label) => {
    expect(criteriaLabel(count)).toBe(label);
  });
});

import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  type DataEntry,
  retentionText,
  SecuritySummarySchema,
  SUMMARY_SECTIONS,
  summaryCards,
  technicalTraceIn,
} from "../src/index.ts";

/** TK-117 lot A (cas 1 et 4, A7, B796, B800) : résumé sans trace technique, conservation composée par le code. */
const entry = (donnee: string, conservation?: string, categorie = "contact"): DataEntry =>
  ({ donnee, champs: ["user.email"], categorie, conservation, acces: [] }) as DataEntry;

describe("aucune trace technique dans le résumé", () => {
  it("refuse tout identifiant, chemin et empreinte de commit", () => {
    for (const text of [
      "F-009",
      "(R-003)",
      "SEC-T08",
      "NFR-001",
      "ADR-006",
      "ST-sms",
      "ENV-prod",
      "C-api",
      "T-user",
      "S-agenda",
      "P-reserver",
      "RL-gerante",
      "PM-compte.creer",
      "FX-demo",
      "AC-2",
      "Voir F\u2011009",
      "voir security/data.yaml",
      "data/tables/user.yaml",
      "version 7a3d91e",
    ]) {
      expect(technicalTraceIn(text), text).toBe(true);
    }
  });

  it("accepte un texte ordinaire", () => {
    for (const text of [
      "Chez un hébergeur à Paris, en France.",
      "Nous vous prévenons sous 24 heures ; la CNIL sous 72 heures (RGPD).",
      "Un code à 4 chiffres ; appelez le 0600000000.",
      "C'est-à-dire : e-mail, rendez-vous, peut-être.",
      "La façade et le site Internet restent accessibles.",
    ]) {
      expect(technicalTraceIn(text), text).toBe(false);
    }
  });
});

describe("combien de temps on garde (A7)", () => {
  it("« À décider » sans aucune durée saisie", () => {
    expect(retentionText([])).toBe("À décider");
    expect(retentionText([entry("E-mail")])).toBe("À décider");
    expect(retentionText([{ ...entry("E-mail"), conservation_proposee: "3 ans" }])).toBe(
      "À décider",
    );
  });

  it("durées saisies regroupées ; une donnée sans durée reste « à décider »", () => {
    const entries = [
      entry("E-mail", "3 ans"),
      entry("Téléphone", "3 ans"),
      entry("Note", undefined, "sensible"),
      entry("Jeton", undefined, "secret"),
    ];
    expect(retentionText(entries)).toBe("E-mail, Téléphone : 3 ans. Note : à décider.");
  });

  it("reste bornée et sans trace technique, quel que soit le volume ou le libellé", () => {
    const many = Array.from({ length: 3000 }, (_, i) => entry(`Donnée ${i}`, `${i} mois`));
    const text = retentionText(many);
    expect(text.length).toBeLessThanOrEqual(2000);
    const dirty = retentionText([entry("user.email (F-001)", "voir R-003")]);
    expect(technicalTraceIn(dirty)).toBe(false);
  });

  it("les cartes remplacent la section écrite par la durée composée", () => {
    const summary = SecuritySummarySchema.parse(
      Object.fromEntries(SUMMARY_SECTIONS.map(({ key }) => [key, `Texte ${key}`])),
    );
    const cards = summaryCards(summary, [entry("E-mail", "3 ans")]);
    expect(cards.map((c) => c.key)).toEqual(SUMMARY_SECTIONS.map((s) => s.key));
    expect(cards[4]).toEqual({
      key: "conservation",
      title: "Combien de temps on garde",
      text: "E-mail : 3 ans.",
    });
    expect(cards[0]?.text).toBe("Texte donnees");
  });
});

describe("aucune durée par défaut codée (A7)", () => {
  it("le code de la Sécurité ne porte aucune constante de durée", () => {
    const root = resolve(import.meta.dirname, "../src");
    const files = [
      ...readdirSync(join(root, "security")).map((name) => join(root, "security", name)),
      join(root, "entities/security.ts"),
      join(root, "proposals/security.ts"),
    ];
    for (const file of files) {
      const code = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
      expect(code, file).not.toMatch(/\b\d+\s*(ans?|mois|jours?|days?|months?|years?)\b/i);
    }
  });
});

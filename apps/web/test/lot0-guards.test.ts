import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * TK-87 (passation 01 §0.2 à §0.5, décision B15) : gardes par lecture de sources sur tout `apps/web/src`.
 * CA3 cas 3.5 (aucun badge fait main), CA4 cas 4.4 (aucun nom de fournisseur dans le bloc d'envoi),
 * CA5 cas 5.2 (échelle typographique : plus de tailles arbitraires de titre), CA6 cas 6.4 (galerie).
 */
const src = join(import.meta.dirname, "../src");
const sources = readdirSync(src, { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile() && /\.(ts|tsx)$/.test(entry.name))
  .map((entry) => join(entry.parentPath, entry.name));
const read = (file: string) => readFileSync(file, "utf8");
const rel = (file: string) => relative(src, file);

describe("CA5 (5.2) : échelle v2 appliquée, aucune taille de titre arbitraire", () => {
  it("aucun text-[30px], text-[22px] ni text-[24px] dans apps/web/src", () => {
    const offenders = sources
      .filter((f) => /text-\[(?:30|22|24)px\]/.test(read(f)))
      .map(rel)
      .sort();
    expect(offenders).toEqual([]);
  });

  it("chaque h1 porte l'utilitaire text-page-title (24 / 600 / −0,02 em)", () => {
    const offenders: string[] = [];
    for (const file of sources) {
      for (const m of read(file).matchAll(/<h1\b[^>]*>/gs)) {
        if (!/\btext-page-title\b/.test(m[0])) offenders.push(`${rel(file)} : ${m[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("le garde voit bien des h1 (il ne passe pas à vide)", () => {
    const count = sources.reduce((n, f) => n + [...read(f).matchAll(/<h1\b/g)].length, 0);
    expect(count).toBeGreaterThanOrEqual(4);
  });
});

describe("CA5 (5.2) : h2, h3 et titres de Sheet sur l'échelle v2", () => {
  /**
   * Retour de revue TK-87 (tour 1) : h2 de section en text-section-title, h3 de carte ou de groupe
   * en text-subsection-title, titres de Sheet en text-section-title (DESIGN.md §3, 02-design §2.4).
   * TK-141 : le h2 de section de Réglages peut être en text-settings-title (20/600, DESIGN I19) ;
   * le h3 d'un formulaire dont le titre est lu seulement par les lecteurs d'écran est en sr-only.
   * Seule exception : l'en-tête de colonne du kanban, un h2 en 14/600 (S-kanban « En-tête de colonne »).
   */
  const HEADING_RULES: { tag: RegExp; utility: string; except?: string[] }[] = [
    {
      tag: /<h2\b[^>]*>/gs,
      utility: "text-(?:section|settings)-title",
      except: ["components/kanban-column.tsx"],
    },
    {
      tag: /<h3\b[^>]*>/gs,
      utility: "(?:text-subsection-title|sr-only)",
      // h3 de proposition : style porté par `Prose` de packages/ui (18/600, maquette 06), pas de classe locale.
      except: ["components/idea-proposal-text.tsx"],
    },
    { tag: /<SheetTitle\b[^>]*\bclassName=[^>]*>/gs, utility: "text-section-title" },
  ];

  it.each(HEADING_RULES)("chaque $tag porte $utility", ({ tag, utility, except = [] }) => {
    const offenders: string[] = [];
    for (const file of sources) {
      if (except.includes(rel(file))) continue;
      for (const m of read(file).matchAll(tag)) {
        if (!new RegExp(`\\b${utility}\\b`).test(m[0])) offenders.push(`${rel(file)} : ${m[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("l'exception du kanban reste sur l'échelle (text-subsection-title)", () => {
    const code = read(join(src, "components/kanban-column.tsx"));
    for (const m of code.matchAll(/<h2\b[^>]*>/gs))
      expect(m[0]).toMatch(/\btext-subsection-title\b/);
  });

  it("aucun titre n'empile une taille ou un interlettrage hors échelle", () => {
    const offScale =
      /\b(?:text-(?:xs|sm|base|lg|xl|2xl)|tracking-\[[^\]]+\]|tracking-(?:tight|wide))\b/;
    const offenders: string[] = [];
    for (const file of sources) {
      for (const m of read(file).matchAll(/<(?:h[1-3]|SheetTitle|CardTitle)\b[^>]*>/gs)) {
        if (offScale.test(m[0])) offenders.push(`${rel(file)} : ${m[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("le garde voit bien des h2 et des h3 (il ne passe pas à vide)", () => {
    const all = sources.map(read).join("\n");
    expect([...all.matchAll(/<h2\b/g)].length).toBeGreaterThanOrEqual(10);
    expect([...all.matchAll(/<h3\b/g)].length).toBeGreaterThanOrEqual(4);
  });
});

/** Écrans du lot C (S-features, S-kanban, S-github). */
const SCREENS = [
  "components/features-list.tsx",
  "components/feature-sheet.tsx",
  "components/feature-status.tsx",
  "components/kanban-card.tsx",
  "components/github-status.tsx",
  "components/github-installations.tsx",
];

describe("CA3 (3.5) : aucun badge de statut ni de priorité fait main", () => {
  it.each(["StatusBadge", "PriorityText", "InstallationStatusBadge", "AuthorizationBadge"])(
    "aucun fichier de apps/web/src ne déclare de composant %s",
    (name) => {
      const declaration = new RegExp(`(?:function|const)\\s+${name}\\b`);
      expect(sources.filter((f) => declaration.test(read(f))).map(rel)).toEqual([]);
    },
  );

  it.each(SCREENS)("%s n'importe plus StatusBadge de @koklo/ui", (file) => {
    const code = read(join(src, file));
    expect(code).not.toMatch(/\bStatusBadge\b/);
  });

  it("les écrans utilisent les composants de @koklo/ui", () => {
    const all = SCREENS.map((f) => read(join(src, f))).join("\n");
    for (const name of ["LifecycleStatus", "ValidationStatus", "PriorityIndicator"]) {
      expect(all, name).toMatch(new RegExp(`\\b${name}\\b`));
    }
  });
});

const PROVIDERS = /Anthropic|OpenAI|Gemini|Google|Mistral|OpenRouter|Claude|GPT|États-Unis/i;

describe("CA4 (4.4) : le bloc d'envoi ne nomme aucun fournisseur (B15)", () => {
  it("ai-send-policy.tsx ne cite ni fournisseur ni pays", () => {
    expect(read(join(src, "components/ai-send-policy.tsx"))).not.toMatch(PROVIDERS);
  });

  it("ai-send-policy.tsx compose InlineAlert de @koklo/ui (plus d'Alert fait main)", () => {
    const code = read(join(src, "components/ai-send-policy.tsx"));
    expect(code).toMatch(/\bInlineAlert\b/);
    expect(code).not.toMatch(/<h3\b/);
  });
});

describe("CA6 (6.3, 6.4) : galerie /dev/ui fermée en production, sans variable publique", () => {
  const page = join(src, "app/dev/ui/page.tsx");

  it("la page lit APP_ENV à l'exécution par readRuntimeConfig et appelle notFound()", () => {
    const code = read(page);
    expect(code).toMatch(/\breadRuntimeConfig\b/);
    expect(code).toMatch(/\bnotFound\(\)/);
    expect(code).toMatch(/production/);
  });

  it("aucune variable NEXT_PUBLIC_* dans la galerie", () => {
    const gallery = sources.filter((f) => rel(f).startsWith("app/dev/ui/") || /dev-ui-/.test(f));
    expect(gallery.length).toBeGreaterThan(0);
    for (const file of gallery) expect(read(file), rel(file)).not.toContain("NEXT_PUBLIC_");
  });

  it("/dev/ui n'est pas ajoutée au matcher de proxy.ts (H5)", () => {
    expect(read(join(src, "proxy.ts"))).not.toMatch(/["']\/dev/);
  });
});

import { readFileSync } from "node:fs";
import { relative } from "node:path";
import { describe, expect, it } from "vitest";
import { designAlerts, designStatus, loadBlocks, norm, type StatusKey } from "./helpers/css.ts";
import { cssPath, readRequired, stylesDir, walk } from "./helpers/paths.ts";

const STATUSES: readonly StatusKey[] = ["validated", "pending", "revise"];

describe("CA4 - variables de statut (DESIGN.md §2.2)", () => {
  it.each(STATUSES)("statut %s : 4 variables clair/sombre aux valeurs de DESIGN.md", (status) => {
    const expected = designStatus()[status];
    const blocks = loadBlocks(cssPath.status);
    const light = blocks[":root"] ?? {};
    const dark = blocks[".dark"] ?? {};
    expect(norm(light[`--status-${status}-bg`])).toBe(expected.lightBg);
    expect(norm(light[`--status-${status}-fg`])).toBe(expected.lightFg);
    expect(norm(dark[`--status-${status}-bg`])).toBe(expected.darkBg);
    expect(norm(dark[`--status-${status}-fg`])).toBe(expected.darkFg);
  });

  it("6 variables --status-* par thème plus l'icône de clé (TK-107), en hex, sans dérivation de --primary", () => {
    const blocks = loadBlocks(cssPath.status);
    for (const selector of [":root", ".dark"]) {
      const vars = blocks[selector] ?? {};
      const statusVars = Object.keys(vars).filter((n) => n.startsWith("--status-"));
      expect(statusVars.sort()).toEqual(
        [
          ...STATUSES.flatMap((s) => [`--status-${s}-bg`, `--status-${s}-fg`]),
          "--status-pending-icon",
        ].sort(),
      );
      for (const name of statusVars) expect(vars[name]).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
    expect(readRequired(cssPath.status)).not.toMatch(/--primary|--ring|--accent/);
  });

  it("status.css ne déclare que des --status-* et des --alert-* (TK-87)", () => {
    const blocks = loadBlocks(cssPath.status);
    for (const selector of [":root", ".dark"]) {
      const names = Object.keys(blocks[selector] ?? {});
      expect(names.filter((n) => !/^--(status|alert)-/.test(n))).toEqual([]);
    }
  });
});

const ALERT_PARTS = ["bg", "border", "fg"] as const;

describe("CA1 (TK-87) - couleurs d'alerte (DESIGN.md §2.2 v2, passation 01 §0.1)", () => {
  it.each(["warning", "error"] as const)(
    "alerte %s : fond, bordure et texte aux valeurs de DESIGN.md, en clair et en sombre",
    (alert) => {
      const expected = designAlerts()[alert];
      const blocks = loadBlocks(cssPath.status);
      for (const part of ALERT_PARTS) {
        expect(norm(blocks[":root"]?.[`--alert-${alert}-${part}`]), `clair ${part}`).toBe(
          expected.light[part],
        );
        expect(norm(blocks[".dark"]?.[`--alert-${alert}-${part}`]), `sombre ${part}`).toBe(
          expected.dark[part],
        );
      }
    },
  );

  it("valeurs du tableau 01 §0.1 (garde contre une dérive de DESIGN.md)", () => {
    expect(designAlerts()).toEqual({
      warning: {
        light: { bg: "#fffbeb", border: "#fcd34d", fg: "#78350f" },
        dark: { bg: "#3a2a0c", border: "#78350f", fg: "#fde68a" },
      },
      error: {
        light: { bg: "#fef2f2", border: "#fca5a5", fg: "#991b1b" },
        dark: { bg: "#3b1219", border: "#7f1d1d", fg: "#fecaca" },
      },
    });
  });

  it("variante neutre : alias de --surface (clair) / --raised (sombre), --border, --foreground", () => {
    const blocks = loadBlocks(cssPath.status);
    const light = blocks[":root"] ?? {};
    const dark = blocks[".dark"] ?? {};
    expect(norm(light["--alert-neutral-bg"])).toBe("var(--surface)");
    expect(norm(dark["--alert-neutral-bg"])).toBe("var(--raised)");
    for (const vars of [light, dark]) {
      expect(norm(vars["--alert-neutral-border"])).toBe("var(--border)");
      expect(norm(vars["--alert-neutral-fg"])).toBe("var(--foreground)");
    }
  });
});

/** Échelle §3 v2 (passation 01 §0.2, TK-87) : rôle -> taille (px), graisse, interlettrage exacts. */
const SCALE = {
  "page-title": { size: 24, weight: 600, tracking: "-0.02em" },
  "section-title": { size: 16, weight: 600, tracking: "normal" },
  "subsection-title": { size: 14, weight: 600, tracking: "normal" },
  body: { size: 14, weight: 400, tracking: "normal" },
  secondary: { size: 13, weight: 400, tracking: "normal" },
  "group-label": { size: 11, weight: 600, tracking: "0.06em" },
  caption: { size: 12, weight: 500, tracking: "normal" },
  code: { size: 12, weight: 500, tracking: "normal" },
} as const;

describe("CA4 - échelle typographique (DESIGN.md §3)", () => {
  it("déclare les familles --font-sans et --font-mono", () => {
    const root = loadBlocks(cssPath.typography)[":root"] ?? {};
    expect(root["--font-sans"]).toContain("Instrument Sans");
    expect(root["--font-mono"]).toContain("JetBrains Mono");
  });

  it.each(Object.keys(SCALE) as Array<keyof typeof SCALE>)(
    "rôle %s : taille, graisse, interlettrage (v2)",
    (role) => {
      const root = loadBlocks(cssPath.typography)[":root"] ?? {};
      const spec = SCALE[role];
      const size = /^(\d+(?:\.\d+)?)px$/.exec(root[`--text-${role}-size`] ?? "")?.[1];
      expect(size, `--text-${role}-size en px`).toBeDefined();
      expect(Number(size), `--text-${role}-size`).toBe(spec.size);
      expect(Number(root[`--text-${role}-weight`]), `--text-${role}-weight`).toBe(spec.weight);
      expect(norm(root[`--text-${role}-tracking`]), `--text-${role}-tracking`).toBe(spec.tracking);
    },
  );

  it("chaque rôle de l'échelle a sa famille (--font-sans, --font-mono pour le code)", () => {
    const root = loadBlocks(cssPath.typography)[":root"] ?? {};
    for (const role of Object.keys(SCALE)) {
      const expected = role === "code" ? "var(--font-mono)" : "var(--font-sans)";
      expect(norm(root[`--text-${role}-font`]), `--text-${role}-font`).toBe(expected);
    }
  });

  it("la graisse du code est en JetBrains Mono (--font-mono) et le titre en Instrument Sans", () => {
    const root = loadBlocks(cssPath.typography)[":root"] ?? {};
    expect(norm(root["--text-code-font"])).toBe("var(--font-mono)");
    expect(norm(root["--text-page-title-font"])).toBe("var(--font-sans)");
  });
});

describe("CA4 - valeurs « à confirmer » isolées dans tentative.css", () => {
  const TENTATIVE = ["--destructive", "--destructive-foreground", "--primary", "--ring"];

  it("tentative.css déclare les 4 variables en clair et en sombre", () => {
    const blocks = loadBlocks(cssPath.tentative);
    for (const selector of [":root", ".dark"]) {
      for (const name of TENTATIVE) {
        expect(blocks[selector]?.[name], `${selector} ${name}`).toBeDefined();
      }
    }
  });

  it("aucun autre fichier CSS de src/ ne déclare ces variables", () => {
    const cssFiles = walk(stylesDir, []).filter((f) => f.endsWith(".css"));
    const names = cssFiles.map((f) => relative(stylesDir, f));
    expect(names).toContain("tentative.css");
    const declaring = cssFiles
      .filter((f) => !f.endsWith("tentative.css"))
      .filter((f) => TENTATIVE.some((n) => new RegExp(`${n}\\s*:`).test(readFileSync(f, "utf8"))));
    expect(declaring.map((f) => relative(stylesDir, f))).toEqual([]);
  });
});

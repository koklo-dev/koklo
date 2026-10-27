import { beforeAll, describe, expect, it } from "vitest";
import { compileIndexCss } from "./helpers/compile-css.ts";

const CANDIDATES = [
  "bg-primary",
  "text-primary-foreground",
  "bg-status-validated",
  "text-status-validated-foreground",
  "bg-status-pending",
  "text-status-pending-foreground",
  "bg-status-revise",
  "text-status-revise-foreground",
  "text-muted-foreground",
  "rounded-lg",
];

describe("CA3 - index.css compilé par Tailwind", () => {
  let output = "";

  beforeAll(async () => {
    output = await compileIndexCss(CANDIDATES);
  });

  it("compile et produit les @font-face locaux des deux familles", () => {
    expect(output).toContain("@font-face");
    expect(output).toContain("Instrument Sans");
    expect(output).toContain("JetBrains Mono");
  });

  it("génère les utilitaires bg-primary et bg-status-*", () => {
    for (const utility of [
      "bg-primary",
      "bg-status-validated",
      "bg-status-pending",
      "bg-status-revise",
    ]) {
      expect(output, utility).toContain(`.${utility}`);
    }
  });

  it("ne contient ni Google Fonts ni URL distante", () => {
    expect(output).not.toMatch(/fonts\.googleapis\.com|fonts\.gstatic\.com/);
    expect(output).not.toMatch(/(?:url\(\s*["']?|@import\s+["']?)(?:https?:)?\/\//);
    // le commentaire de licence de Tailwind cite https://tailwindcss.com : ce n'est pas une requête
    const withoutComments = output.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(withoutComments).not.toMatch(/https?:\/\//);
  });

  it("référence uniquement des fichiers de polices relatifs", () => {
    const urls = [...output.matchAll(/url\(([^)]+)\)/g)].map((m) => m[1] ?? "");
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) expect(url).toMatch(/^["']?\.\/files\//);
  });
});

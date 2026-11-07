import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { extractMaquette, findMaquette, formatMaquette } from "../src/maquette-source.ts";

const DIR = resolve(import.meta.dirname, "..", "..", "..", "docs", "refonte", "maquettes");

const SAMPLE = `<!doctype html><html><head><title> Lot 13 · Réglages </title>
<script>window.__resources={};</script>
<script src="data:text/javascript;base64,QUJD"></script>
</head><body><div style="background:var(--soft)">Membres</div>
<script type="text/x-dc" data-dc-script>
class Component { pill() { return 'soft'; } }
</script></body></html>`;

describe("extractMaquette", () => {
  it("garde le gabarit et la logique, retire les bibliothèques en base64", () => {
    const source = extractMaquette(SAMPLE);
    expect(source.title).toBe("Lot 13 · Réglages");
    expect(source.template).toContain('<div style="background:var(--soft)">Membres</div>');
    expect(source.template).not.toContain("base64");
    expect(source.template).not.toContain("<script");
    expect(source.logic).toBe("class Component { pill() { return 'soft'; } }");
  });

  it("formate titre, gabarit puis logique", () => {
    const text = formatMaquette("24-Lot13Reglages.html", extractMaquette(SAMPLE));
    expect(text.indexOf("## Gabarit")).toBeLessThan(text.indexOf("## Logique"));
    expect(text).toContain("# Maquette 24-Lot13Reglages.html — Lot 13 · Réglages");
  });
});

describe("maquettes du dépôt", () => {
  const files = readdirSync(DIR).filter((f) => f.endsWith(".html") && f !== "index.html");

  it("se trouvent par numéro ou par nom", () => {
    expect(findMaquette(DIR, "24")).toBe("24-Lot13Reglages.html");
    expect(findMaquette(DIR, "5")).toBe("05-Lot1Shell.html");
    expect(findMaquette(DIR, "reglages")).toBe("24-Lot13Reglages.html");
    expect(findMaquette(DIR, "inexistante")).toBeUndefined();
  });

  it.each(files)("%s : code lisible sans base64, nettement plus court que le fichier", (file) => {
    const html = readFileSync(resolve(DIR, file), "utf8");
    const text = formatMaquette(file, extractMaquette(html));
    expect(text).not.toMatch(/base64,[A-Za-z0-9+/=]{200}/);
    expect(text.length).toBeLessThan(html.length);
  });
});

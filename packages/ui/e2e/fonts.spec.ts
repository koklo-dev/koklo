import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { createRequire } from "node:module";
import type { AddressInfo } from "node:net";
import { dirname, join } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { compileIndexCss } from "../test/helpers/compile-css.ts";

const require = createRequire(import.meta.url);

/** Dossiers `files/` des deux paquets Fontsource : les noms de fichiers sont préfixés par famille. */
const fontDirs = ["@fontsource/instrument-sans", "@fontsource/jetbrains-mono"].map((pkg) =>
  join(dirname(require.resolve(`${pkg}/package.json`)), "files"),
);

const FAMILIES = [
  { family: "Instrument Sans", weights: [400, 500, 600, 700] },
  { family: "JetBrains Mono", weights: [400, 500] },
];

const PAGE = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><link rel="stylesheet" href="/css/index.css"></head>
<body><p>Koklo Aa</p></body></html>`;

let server: Server;
let origin = "";
let css = "";

function readFont(name: string): Buffer | undefined {
  for (const dir of fontDirs) {
    try {
      return readFileSync(join(dir, name));
    } catch {
      // absent de ce paquet : on essaie le suivant
    }
  }
  return undefined;
}

test.beforeAll(async () => {
  css = await compileIndexCss();
  server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const font = url.pathname.startsWith("/css/files/")
      ? readFont(url.pathname.slice("/css/files/".length))
      : undefined;
    if (url.pathname === "/") {
      res.setHeader("content-type", "text/html").end(PAGE);
    } else if (url.pathname === "/css/index.css") {
      res.setHeader("content-type", "text/css").end(css);
    } else if (font) {
      res.setHeader("content-type", "font/woff2").end(font);
    } else {
      res.statusCode = 404;
      res.end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

test.afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

/** Charge la page en relevant toute requête dont l'hôte n'est pas celui du serveur local. */
async function loadPage(page: Page, dark: boolean) {
  const remote: string[] = [];
  const fontFiles: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.origin !== origin) remote.push(request.url());
    else if (url.pathname.endsWith(".woff2")) fontFiles.push(url.pathname);
  });
  await page.goto(origin);
  if (dark) await page.evaluate(() => document.documentElement.classList.add("dark"));
  await page.evaluate(async (families) => {
    await Promise.all(
      families.flatMap(({ family, weights }) =>
        weights.map((weight) => document.fonts.load(`${weight} 16px "${family}"`, "Aa")),
      ),
    );
  }, FAMILIES);
  return { remote, fontFiles };
}

for (const dark of [false, true]) {
  test.describe(dark ? "thème sombre (.dark)" : "thème clair", () => {
    test("aucune requête hors hôte local (donc aucun CDN de polices)", async ({ page }) => {
      const { remote } = await loadPage(page, dark);
      expect(remote).toEqual([]);
    });

    test("Instrument Sans (400-700) et JetBrains Mono (400-500) sont chargées localement", async ({
      page,
    }) => {
      const { fontFiles } = await loadPage(page, dark);
      const loaded = await page.evaluate(() =>
        [...document.fonts]
          .filter((face) => face.status === "loaded")
          .map((face) => `${face.family.replaceAll('"', "")}:${face.weight}`),
      );
      for (const { family, weights } of FAMILIES) {
        for (const weight of weights) expect(loaded).toContain(`${family}:${weight}`);
      }
      expect(fontFiles.length).toBeGreaterThanOrEqual(6);
    });

    test("le corps de page est rendu avec Instrument Sans", async ({ page }) => {
      await loadPage(page, dark);
      const family = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
      expect(family).toContain("Instrument Sans");
    });
  });
}

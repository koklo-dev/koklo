import { readdirSync, readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { extname, join, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { build } from "esbuild";
import { compileIndexCss } from "../test/helpers/compile-css.ts";

const srcDir = resolve(import.meta.dirname, "../src");

const PAGE = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><link rel="stylesheet" href="/index.css"></head>
<body><div id="root"></div><script type="module" src="/main.js"></script></body></html>`;

const MIME: Record<string, string> = { ".js": "text/javascript", ".css": "text/css" };

/** Jetons de classes Tailwind présents dans les sources : suffisant pour styler la fixture. */
function classCandidates(dir: string): string[] {
  const tokens = new Set<string>();
  for (const entry of readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (!entry.isFile() || !/\.tsx?$/.test(entry.name)) continue;
    const text = readFileSync(join(entry.parentPath, entry.name), "utf8");
    for (const token of text.split(/[\s"'`]+/)) tokens.add(token);
  }
  return [...tokens];
}

let server: Server;
let origin = "";

test.beforeAll(async () => {
  // Bundle ESM avec découpage : les icônes générées restent des imports dynamiques, donc des fichiers à la demande.
  const bundle = await build({
    entryPoints: [resolve(import.meta.dirname, "fixture/main.tsx")],
    bundle: true,
    splitting: true,
    format: "esm",
    outdir: "/",
    write: false,
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
  });
  const files = new Map<string, string>(
    bundle.outputFiles.map((file) => [file.path.replace(/^\/?/, "/"), file.text]),
  );
  files.set("/index.css", await compileIndexCss(classCandidates(srcDir)));
  server = createServer((req, res) => {
    const path = new URL(req.url ?? "/", "http://localhost").pathname;
    const body = path === "/" ? PAGE : files.get(path);
    if (body === undefined) {
      res.statusCode = 404;
      res.end();
      return;
    }
    res.setHeader(
      "content-type",
      path === "/" ? "text/html" : (MIME[extname(path)] ?? "text/plain"),
    );
    res.end(body);
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

test.afterAll(() => new Promise<void>((done) => server.close(() => done())));

test("icônes, statuts et overlays fonctionnent dans un navigateur, sans requête distante", async ({
  page,
}) => {
  const remote: string[] = [];
  const errors: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).origin !== origin) remote.push(request.url());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(origin);

  await test.step("StatusBadge : une icône pleine au tracé non vide pour chacun des trois statuts", async () => {
    for (const label of ["Validée", "À valider", "À revoir"]) {
      const path = page.getByText(label, { exact: true }).locator("svg path");
      await expect(path).toHaveAttribute("d", /\S/);
    }
  });

  await test.step("IconButton : l'icône chargée à la demande est rendue", async () => {
    const button = page.getByRole("button", { name: "Rechercher" });
    await expect(button.locator("svg path")).toHaveAttribute("d", /\S/);
  });

  await test.step("Sheet : s'ouvre, expose une boîte de dialogue et se ferme", async () => {
    await page.getByRole("button", { name: "Ouvrir le panneau" }).click();
    const dialog = page.getByRole("dialog", { name: "Panneau" });
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: "Fermer" }).locator("svg path"),
    ).toHaveAttribute("d", /\S/);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });

  await test.step("Select : la liste s'ouvre et une option se choisit", async () => {
    await page.getByRole("combobox", { name: "Choix" }).click();
    await expect(page.getByRole("listbox")).toBeVisible();
    await page.getByRole("option", { name: "Option B" }).click();
    await expect(page.getByRole("combobox", { name: "Choix" })).toHaveText("Option B");
  });

  expect(errors).toEqual([]);
  expect(remote).toEqual([]);
});

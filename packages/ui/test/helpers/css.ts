import { cssPath, designPath, readRequired } from "./paths.ts";

export type VarMap = Record<string, string>;
export type Blocks = Record<string, VarMap>;

/** Parse des blocs `selecteur { --x: v; }` (sans imbrication), commentaires retirés. */
export function parseBlocks(css: string): Blocks {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const blocks: Blocks = {};
  for (const m of clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = (m[1] ?? "").trim();
    if (selector.startsWith("@")) continue;
    const target = blocks[selector] ?? {};
    for (const decl of (m[2] ?? "").split(";")) {
      const idx = decl.indexOf(":");
      if (idx < 0) continue;
      const name = decl.slice(0, idx).trim();
      if (name.startsWith("--")) target[name] = decl.slice(idx + 1).trim();
    }
    blocks[selector] = target;
  }
  return blocks;
}

export function loadBlocks(path: string): Blocks {
  return parseBlocks(readRequired(path));
}

/** Fusionne plusieurs variables CSS (le dernier gagne). */
export function merge(...maps: VarMap[]): VarMap {
  return Object.assign({}, ...maps);
}

/** Valeur effective (theme.css + tentative.css) d'un thème : `:root` ou `.dark`. */
export function effectiveTheme(selector: ":root" | ".dark"): VarMap {
  return merge(
    loadBlocks(cssPath.theme)[selector] ?? {},
    loadBlocks(cssPath.tentative)[selector] ?? {},
  );
}

/** Tokens §2.1 de DESIGN.md : bloc css situé entre `### 2.1` et `### 2.2`. */
export function designTokens(): Blocks {
  const md = readRequired(designPath);
  const section = md.split(/^### 2\.1\b.*$/m)[1]?.split(/^### 2\.2\b/m)[0] ?? "";
  const css = /```css\n([\s\S]*?)```/.exec(section)?.[1];
  if (!css) throw new Error("Bloc css §2.1 introuvable dans DESIGN.md");
  return parseBlocks(css);
}

export type StatusKey = "validated" | "pending" | "revise";
export interface StatusColors {
  lightBg: string;
  lightFg: string;
  darkBg: string;
  darkFg: string;
}

const statusRows: Record<StatusKey, string> = {
  validated: "Validée",
  pending: "À valider",
  revise: "À revoir",
};

/** Couleurs de statut §2.2 de DESIGN.md (fond / texte, clair puis sombre). */
export function designStatus(): Record<StatusKey, StatusColors> {
  const md = readRequired(designPath);
  const section = md.split(/^### 2\.2\b.*$/m)[1]?.split(/^## 3\./m)[0] ?? "";
  const out = {} as Record<StatusKey, StatusColors>;
  for (const key of Object.keys(statusRows) as StatusKey[]) {
    const row = section.split("\n").find((l) => l.startsWith(`| ${statusRows[key]} `));
    const hex = [...(row ?? "").matchAll(/`(#[0-9a-fA-F]{6})`/g)].map((m) =>
      (m[1] ?? "").toLowerCase(),
    );
    const [lightBg, lightFg, darkBg, darkFg] = hex;
    if (!lightBg || !lightFg || !darkBg || !darkFg) {
      throw new Error(`Ligne de statut §2.2 introuvable ou incomplète : ${statusRows[key]}`);
    }
    out[key] = { lightBg, lightFg, darkBg, darkFg };
  }
  return out;
}

/** Normalise une valeur pour comparaison (hex insensible à la casse, espaces réduits). */
export function norm(value: string | undefined): string {
  return (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

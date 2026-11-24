import type { GitProvider } from "@koklo/domain";
import { GitReadCache } from "@koklo/github";
import { createLogger } from "@koklo/observability";
import { describe, expect, it } from "vitest";
import { DOC_SECTIONS_MAX, headDocSections, type SpecHead } from "./doc-sections.ts";

/**
 * TK-114e (B670) : sections du document d'architecture lues dans git au commit de la tête indexée, 100 au plus. Fournisseur
 * absent, tête absente ou panne : liste vide et avertissement, jamais d'exception (le lancement continue).
 */
const HEAD: SpecHead = {
  installation: { id: "42", owner: { kind: "organization", login: "acme" } },
  repo: { owner: { kind: "organization", login: "acme" }, name: "spec" },
  specPath: "spec",
  commitSha: "abc123",
};

function fakeProvider(paths: string[], fail = false) {
  const reads: { path: string; ref: string }[] = [];
  const provider = {
    authenticate: async () => {
      if (fail) throw new Error("panne");
      return { token: "t" };
    },
    listFiles: async ({ ref }: { ref: string }) => ({
      ref,
      files: paths.map((path) => ({ path, sha: `s-${path}` })),
    }),
    readFile: async ({ path, ref }: { path: string; ref: string }) => {
      reads.push({ path, ref });
      const slug = /\d{2,}-([a-z0-9-]+)\.md$/.exec(path)?.[1] ?? "";
      return {
        path,
        ref,
        sha: `s-${path}`,
        content: `---\nstatut: brouillon\n---\n# Titre ${slug}\n\nTexte.\n`,
      };
    },
  };
  return { provider: provider as unknown as GitProvider, reads };
}

function capture() {
  const lines: string[] = [];
  const logger = createLogger({
    level: "warn",
    destination: { write: (line) => lines.push(line) },
  });
  return { logger, lines };
}

describe("headDocSections (TK-114e)", () => {
  it("liste l'arbre au commit de la tête, garde les sections du dossier de la spec, lit leur titre", async () => {
    const { provider, reads } = fakeProvider([
      "spec/architecture/overview/01-contexte.md",
      "spec/architecture/overview/02-taches-modeles-de-taches-et-cycle-de-vie.md",
      "architecture/overview/03-hors-spec.md",
      "spec/architecture/components/api.yaml",
    ]);
    const sections = await headDocSections(provider, HEAD, capture().logger);
    expect(sections).toEqual([
      { specId: "DOC-contexte", title: "Titre contexte" },
      {
        specId: "DOC-taches-modeles-de-taches-et-cycle-de-vie",
        title: "Titre taches-modeles-de-taches-et-cycle-de-vie",
      },
    ]);
    expect(reads.every((read) => read.ref === "abc123")).toBe(true);
    expect(reads.map((read) => read.path)).toEqual([
      "spec/architecture/overview/01-contexte.md",
      "spec/architecture/overview/02-taches-modeles-de-taches-et-cycle-de-vie.md",
    ]);
  });

  it("au plus 100 sections lues", async () => {
    const paths = Array.from(
      { length: 130 },
      (_, n) => `architecture/overview/${String(n + 1).padStart(3, "0")}-s${n}.md`,
    );
    const { provider, reads } = fakeProvider(paths);
    const sections = await headDocSections(provider, { ...HEAD, specPath: null }, capture().logger);
    expect(DOC_SECTIONS_MAX).toBe(100);
    expect(sections).toHaveLength(100);
    expect(reads).toHaveLength(100);
  });

  it("fournisseur ou tête absents : liste vide ; panne : liste vide et avertissement, sans lever", async () => {
    const quiet = capture();
    expect(await headDocSections(null, HEAD, quiet.logger)).toEqual([]);
    expect(await headDocSections(fakeProvider([]).provider, null, quiet.logger)).toEqual([]);
    expect(quiet.lines).toEqual([]);
    const loud = capture();
    expect(await headDocSections(fakeProvider([], true).provider, HEAD, loud.logger)).toEqual([]);
    expect(loud.lines.join("")).toContain("doc sections");
    expect(loud.lines.join("")).not.toContain("panne");
  });

  it("TK-114f : 2e lancement sur la même tête, avec le cache du worker : aucun readFile", async () => {
    const { provider, reads } = fakeProvider([
      "spec/architecture/overview/01-contexte.md",
      "spec/architecture/overview/02-principes.md",
    ]);
    const head = { ...HEAD, commitSha: "f".repeat(40) };
    const cache = new GitReadCache();
    const first = await headDocSections(provider, head, capture().logger, cache);
    const second = await headDocSections(provider, head, capture().logger, cache);
    expect(second).toEqual(first);
    expect(first.map((section) => section.title)).toEqual(["Titre contexte", "Titre principes"]);
    expect(reads).toHaveLength(2);
  });
});

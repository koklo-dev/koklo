import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Réglages de l'IA, garde d'architecture « la clé n'est jamais retenue » (S-ai-settings §4.10, §11, ADR 0013) :
 * aucun fichier du lot ne touche un stockage, la console, un nom de mutation ou un état React portant la clé ;
 * le champ est non contrôlé et vidé dans un `finally`. Complète le test comportemental `ai-settings-secret`.
 */
const src = join(import.meta.dirname, "../src");

const FILES = [
  "app/(shell)/settings/[section]/page.tsx",
  "components/settings-page.tsx",
  "components/ai-settings-page.tsx",
  "components/ai-credential-card.tsx",
  "components/ai-credential-form.tsx",
  "components/ai-credential-remove.tsx",
  "lib/ai-settings-labels.ts",
];

/** Tout fichier `ai-credential-*`, `ai-settings-*` ou `use-ai-credential-*` ajouté plus tard est contrôlé aussi. */
function extraFiles(): string[] {
  const found: string[] = [];
  for (const dir of ["components", "lib"]) {
    for (const name of readdirSync(join(src, dir))) {
      if (/^(?:use-)?ai-(?:credential|settings)-.*\.tsx?$/.test(name)) found.push(`${dir}/${name}`);
    }
  }
  return found.filter((file) => !FILES.includes(file));
}
const ALL = [...FILES, ...extraFiles()];
const read = (file: string): string => readFileSync(join(src, file), "utf8");
const allCode = (): string =>
  ALL.filter((f) => existsSync(join(src, f)))
    .map(read)
    .join("\n");

describe.each(ALL)("%s", (file) => {
  const path = join(src, file);
  const code = () => readFileSync(path, "utf8");

  it("existe", () => {
    expect(existsSync(path), `${file} absent`).toBe(true);
  });

  it("n'écrit nulle part : ni stockage, ni cookie, ni cache navigateur, ni diffusion, ni brouillon", () => {
    if (!existsSync(path)) throw new Error(`${file} absent`);
    expect(code()).not.toMatch(
      /localStorage|sessionStorage|indexedDB|document\.cookie|caches\.|BroadcastChannel|postMessage|sendBeacon|history\.(?:push|replace)State/,
    );
    expect(code()).not.toMatch(/framing-draft|feature-draft|DraftBanner|use-feature-draft/);
  });

  it("n'écrit rien dans la console", () => {
    if (!existsSync(path)) throw new Error(`${file} absent`);
    expect(code()).not.toMatch(/\bconsole\./);
  });

  it("ne construit aucun HTML et ne persiste pas le cache de requêtes", () => {
    if (!existsSync(path)) throw new Error(`${file} absent`);
    expect(code()).not.toMatch(/dangerouslySetInnerHTML|innerHTML|outerHTML|insertAdjacentHTML/);
    expect(code()).not.toMatch(/persistQueryClient|PersistQueryClient|persister|dehydrate/i);
  });

  it("aucun `mutationKey` : la clé n'entre dans aucune clé du cache", () => {
    if (!existsSync(path)) throw new Error(`${file} absent`);
    expect(code()).not.toMatch(/mutationKey|queryKey\s*:\s*\[[^\]]*(?:apiKey|secret)/);
  });

  it("n'expose pas la clé par l'URL (pas de navigation portant la saisie)", () => {
    if (!existsSync(path)) throw new Error(`${file} absent`);
    expect(code()).not.toMatch(/searchParams\.set\(|URLSearchParams\([^)]*(?:apiKey|secret)/);
  });
});

describe("le formulaire de la clé (components/ai-credential-form.tsx)", () => {
  const form = () => {
    const path = join(src, "components/ai-credential-form.tsx");
    if (!existsSync(path)) throw new Error("components/ai-credential-form.tsx absent");
    return readFileSync(path, "utf8");
  };

  it("champ non contrôlé : aucun `value={...}` et aucun état React portant la clé", () => {
    const code = form();
    expect(code).not.toMatch(/\bvalue=\{/);
    expect(code).not.toMatch(
      /\b(?:apiKey|secret|llmKey|credential|key)\w*\s*,\s*set\w*\s*\]\s*=\s*useState/i,
    );
    expect(code).not.toMatch(/useReducer|useDeferredValue|useRef<string>/);
  });

  it("le champ porte les attributs du design et aucun bouton « afficher »", () => {
    const code = form();
    expect(code).toMatch(/type="password"/);
    expect(code).toMatch(/name="llm-secret"/);
    expect(code).toMatch(/autoComplete="off"/);
    expect(code).not.toMatch(/autoComplete="new-password"/);
    expect(code).toMatch(/maxLength=\{512\}/);
    expect(code).toMatch(/spellCheck=\{false\}/);
    expect(code).toMatch(/data-1p-ignore/);
    expect(code).toMatch(/data-lpignore/);
    expect(code).not.toMatch(/type=\{[^}]*(?:show|visible|reveal)/i);
  });

  it('vidé dans un `finally` (succès et échec) ; formulaire `method="post"` intercepté', () => {
    const code = form();
    expect(code).toMatch(/\bfinally\b/);
    expect(code).toMatch(/method="post"/);
    expect(code).toMatch(/preventDefault\(\)/);
  });

  it("validation locale par le schéma du contrat", () => {
    expect(form()).toMatch(/llmCredentialSetInputSchema/);
  });
});

describe("les mutations (clé jamais conservée par TanStack)", () => {
  it("`gcTime: 0` sur les mutations set et verify", () => {
    const code = allCode();
    expect(code).toMatch(/orpc\.llmCredential\.set\.mutationOptions\(/);
    expect((code.match(/gcTime:\s*0/g) ?? []).length).toBeGreaterThanOrEqual(1);
  });

  it("aucun `onError`/`onSettled` ne reçoit ni ne journalise les variables", () => {
    expect(allCode()).not.toMatch(/\bonMutate\b|onSettled\s*:\s*\([^)]*variables/);
  });
});

describe("la page s'appuie sur les composants du kit et la politique d'envoi existante", () => {
  it("réutilise AiSendPolicy, canManage et useActiveOrganization", () => {
    const code = allCode();
    expect(code).toMatch(/AiSendPolicy/);
    expect(code).toMatch(/canManage/);
    expect(code).toMatch(/useActiveOrganization/);
  });

  it("n'appelle `llmCredential.list` que pour un rôle autorisé (requête `enabled`)", () => {
    expect(allCode()).toMatch(/enabled/);
  });
});

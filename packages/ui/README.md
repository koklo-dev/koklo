# @koklo/ui

Fondations visuelles de Koklo : thème Indigo, couleurs de statut, typographie, Tailwind v4 et configuration shadcn/ui. Source de vérité des valeurs : `DESIGN.md` (§2 couleurs, §3 typographie) à la racine du dépôt. Aucun composant métier ni écran dans ce paquet pour l'instant.

## Contenu

| Fichier (`src/styles/`) | Rôle                                                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------ |
| `theme.css`             | Blocs `:root` et `.dark` de DESIGN.md §2.1, sauf les valeurs « à confirmer »               |
| `tentative.css`         | Seul fichier déclarant `--primary`, `--ring`, `--destructive`, `--destructive-foreground`  |
| `status.css`            | Statuts Validée / À valider / À revoir (`--status-*-bg`, `--status-*-fg`), clair et sombre |
| `typography.css`        | `--font-sans`, `--font-mono` et l'échelle `--text-<rôle>-{size,weight,tracking,font}`      |
| `fonts.css`             | Polices auto-hébergées via Fontsource (Instrument Sans 400-700, JetBrains Mono 400-500)    |
| `index.css`             | Point d'entrée : Tailwind, imports ci-dessus et `@theme inline` (mappage shadcn)           |

Le thème sombre s'active avec la classe `.dark` sur `html`.

## Utilisation

```css
/* globals.css de l'application */
@import "@koklo/ui/styles.css";
@source "../node_modules/@koklo/ui/src";
```

```ts
import { cn } from "@koklo/ui";
```

Changer l'accent ou le rouge destructif : modifier uniquement `tentative.css` ; les tests de contraste valident la nouvelle valeur.

## shadcn/ui

`components.json` pointe sur `src/styles/index.css` (Tailwind v4, pas de `tailwind.config`). L'utilitaire `cn` est dans `src/lib/cn.ts` (clsx + tailwind-merge).

## Scripts

- `pnpm --filter @koklo/ui test` : Vitest avec couverture (fidélité du thème, contraste WCAG AA 4,5:1, polices locales, statuts, typographie, `cn`).
- `pnpm --filter @koklo/ui build` : compile `cn` vers `dist/` ; le CSS est exporté brut depuis `src/styles/`.
- `pnpm --filter @koklo/ui lint` / `typecheck`.

Les polices sont servies localement : aucune requête vers un service de polices tiers.

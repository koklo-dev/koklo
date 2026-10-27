---
doc_version: 0.1.0
status: draft
last_reviewed: 2026-10-27
covers_commit: 9830e2e
---
# 0004 — Fondations UI : tokens CSS Tailwind v4, valeurs « à confirmer » isolées, polices auto-hébergées

- **Statut** : accepté
- **Date** : 2026-10-27
- **Décideurs** : tech-lead

## Contexte
TK-13 pose le thème Indigo clair/sombre, les couleurs de statut et la typographie de
`DESIGN.md` dans `packages/ui`. Certaines valeurs (accent, `--destructive`) sont « à confirmer »
et doivent pouvoir changer sans toucher aux composants ; les polices ne doivent pas être
chargées depuis un service tiers.

## Décision
- Tailwind v4 en mode CSS (pas de `tailwind.config`), shadcn/ui configuré par `components.json`
  sur `src/styles/index.css` ; les variables sont exposées par `@theme inline`.
- Variables `:root` / `.dark` recopiées à l'identique de `DESIGN.md` §2.1 dans `theme.css`.
- Valeurs « à confirmer » regroupées dans `tentative.css`. `--destructive-foreground` n'est pas
  dans `DESIGN.md` : valeur proposée (`#ffffff` clair, `#0d0b1c` sombre), à valider par le designer.
- Statuts dans `status.css`, en variables dédiées ; le violet de marque n'est jamais un statut.
- Polices via Fontsource (Instrument Sans, JetBrains Mono), versions épinglées, aucune requête
  vers `fonts.googleapis.com`.

## Conséquences
- Changer l'accent ou le rouge destructif ne touche que `tentative.css` ; les tests de contraste
  valident la nouvelle valeur.
- Toute modification de `DESIGN.md` §2 impose de mettre à jour les CSS : le test de fidélité échoue sinon.
- Dépendances ajoutées : `@fontsource/*`, `tailwindcss`, `clsx`, `tailwind-merge`.

## Preuves
- `packages/ui/test/theme-fidelity.test.ts`, `contrast.test.ts`, `fonts.test.ts`,
  `fonts-transitive.test.ts`.

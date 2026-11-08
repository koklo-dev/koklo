---
doc_version: 1
last_reviewed: 2026-11-08
---
# Passation de la refonte : état, méthode, décisions

> À lire au début de chaque session (renvoi depuis `.claude/CLAUDE.md`). Mettre à jour la section « État » à chaque ticket
> fusionné, et ajouter ici toute nouvelle décision de méthode de l'utilisateur. Les décisions produit restent dans
> `docs/refonte/questions.md` (une ligne B-nnn chacune) ; rien ne se décide « dans la conversation » sans être écrit.

## État au 2026-11-08

| Sprint | Ticket | État |
| --- | --- | --- |
| 018 | TK-87, TK-88, TK-94, TK-95, TK-96 | ✅ fusionnés |
| 019 | TK-97, TK-138 à TK-142 | ✅ fusionnés (bibliothèque fidèle aux maquettes, reprise des écrans, axe en CI) |
| 019 | TK-98 (fournisseurs d'IA) | 🟡 fusionné, critère 1 partiel : A5 tranchée (interrupteur « données en UE » par projet), réalisée avec TK-93 qui complète le critère |
| 020 | TK-89 (espace Idée : pages, éditeur, publication, droits) | ✅ fusionné (PR #150, `e8c2247`) |
| 020 | TK-90 (panneau de l'agent, propositions) puis TK-91 (maturité, Synthèse, `idea-vN`, « Passer au cadrage ») | à faire, dans cet ordre |
| 021 | TK-92 (vue d'ensemble) puis TK-93 (projets en cartes, création en une étape) | à faire |

Interdit pour l'instant : le lot 12 (`23-Lot12Tickets`). Questions ouvertes pour l'utilisateur : A1, B16 (`questions.md`).

## Règles de l'utilisateur (ne pas redemander)

- Autonomie : fusion vers `develop` autorisée quand la CI est verte (`gh pr merge N --rebase --delete-branch`). Une
  question ouverte ne bloque pas : lecture la plus prudente conforme aux passations, consignée dans `questions.md`
  (« Décidée en autonomie le AAAA-MM-JJ : … »).
- Maquettes de `docs/refonte/maquettes/` : elles font foi (`pnpm maquette NN`). Composant ou variante absent →
  `packages/ui` (tests, galerie `/dev/ui`, ligne DESIGN.md), jamais de style local dans `apps/web`.
- Bibliothèque : shadcn/ui sur Radix (comportement) + Tailwind. **Une seule famille d'icônes : Material Symbols**, par le
  registre fermé (`pnpm icons:generate`). Pas de Sonner : les toasts utilisent Radix Toast. Aucune dépendance sans ADR.
- Incohérences entre planches : valeur majoritaire des planches récentes (B143) ; choix de l'utilisateur B144
  (segmenté actif neutre sans violet, titres des Réglages à 20 px, `wand_stars` pour les actions de l'agent,
  `smart_toy` pour l'Assistant).
- Données en UE (A5, 2026-11-08) : interrupteur par projet « Les données de ce projet restent dans l'UE » (owner,
  admin) ; activé, OpenRouter n'est jamais appelé pour ce projet. Livré avec TK-93, qui complète le critère 1 de TK-98.
- Découpage de l'espace Idée : TK-89 n'affiche ni agent, ni Synthèse, ni jauge, ni « Passer au cadrage » (pas de bouton
  mort) ; ils arrivent avec TK-90 et TK-91. L'Assistant de cadrage actuel et le brief sont retirés au sprint 022.
- Tout en français ; jamais le nom du fournisseur d'IA dans l'interface ; aucune donnée réelle ni secret ; WCAG 2.2 AA,
  375 px, axe sans violation. Ne jamais cocher une case du sprint sans que chaque critère soit vérifié.
- Jamais de commit de `.project/`, jamais `--no-verify`, jamais d'amend, jamais de push direct sur `develop`.

## Économie de jetons (demande du 2026-11-08)

- **Une session par ticket** : après chaque fusion, mettre à jour ce fichier, puis l'utilisateur fait `/clear`. Tout
  ce qu'il faut savoir est ici, dans le vault (sprints) et dans `questions.md`.
- **Workflow seulement pour les gros tickets** (base + contrat + écran). Petit ticket (correctif, composant, test) :
  directement, sans workflow, ou un seul agent Sonnet.
- Sous-agents en Sonnet par défaut (`/config`, modèle des sous-agents). **Revue visuelle : toujours Opus** (choix de
  l'utilisateur le 2026-11-08).
- Sorties de commandes toujours tronquées (`| tail -40`, `grep` ciblé) ; ne pas relire un fichier déjà lu.
- **Relancer `pnpm lint` après chaque correction, même d'une ligne**, avant de pousser : chaque tour de CI coûte
  30 minutes (deux tours perdus sur TK-89).

## Méthode d'un ticket

1. `git fetch && git checkout -b <type>/tk-NN-<sujet> origin/develop` ; copier le fichier du sprint du vault avant
   d'y toucher.
2. Gros ticket : `Workflow({ name: "koklo-ticket", args: { tk, branch, sprint: "sprint-NNN.md", date, sensitive, ui,
   notes } })` (script `.claude/workflows/koklo-ticket.js` : analyse → 1 à 3 lots → revue code (+ sécurité si
   `sensitive`) et revue visuelle → un tour de correction). `notes` : périmètre des lots, dépendances autorisées,
   hors périmètre. Coupure réseau : relancer avec `resumeFromRunId` et les mêmes `args` (les agents finis sont rejoués
   depuis le cache).
   - `args` est un **objet complet**, jamais `"TK-NN"` : `ui` (booléen) vaut `true` dès que la ligne du ticket a une
     « Maquette : », sinon l'analyse saute l'inventaire de la maquette et la revue visuelle n'a pas lieu (TK-90 : branche
     `undefined`, travail fait sur `develop`, 13 écarts trouvés après coup). Le script refuse désormais un `args` incomplet.
   - Créer la branche **avant** le lancement.
   - Ticket qui réunit base + contrat + flux + plusieurs composants + écran : proposer de le scinder en deux tickets
     (serveur, puis écran) plutôt qu'un seul workflow de 3 h.
   - Corrections après une revue visuelle (leçon de TK-90, 6 tours) : chaque demande de correction exige aussi de
     vérifier le clavier, Échap, le focus et l'axe de l'élément touché, et de relancer le spec e2e complet de l'écran,
     pas seulement le point corrigé (F1 → F14 → F15/F16 → F17 : chaque correctif a créé l'écart suivant). Après deux
     tours ciblés, faire une revue finale large de l'élément au lieu d'un nouveau tour étroit.
3. Repasser derrière le workflow, ce que les revues laissent passer :
   - style recopié dans `apps/web` au lieu d'un composant `packages/ui` ;
   - test qui ne prouve pas le critère (ex. aller-retour testé sur des pages vides) ;
   - captures exigées « chaque état en clair, sombre et 375 px » : toutes produites ;
   - appels réseau refusés en boucle (ex. présence pour un rôle en lecture seule).
4. Verrous locaux : `pnpm lint` ; `pnpm turbo run typecheck --concurrency=2` ; `pnpm build` ;
   `pnpm --filter @koklo/ui exec vitest run --maxWorkers=4` ; `pnpm --filter @koklo/web exec vitest run --maxWorkers=3` ;
   Playwright web complet en arrière-plan (`cd apps/web && pnpm exec playwright test --workers=1`, environ 20 min) ;
   `.github/scripts/commitlint-local.sh`.
5. Captures : l'e2e web réécrit **toutes** les captures. `python3 docs/refonte/outils/trier-captures.py --seuil 400
   --garder <écrans du ticket>`, puis regarder les plus gros écarts restants (souvent le survol de la souris ou une heure
   relative) avant de commiter.
6. Push, PR vers `develop` (corps en français, vérifications réellement faites), attendre la CI ; rebase si `develop`
   a bougé (protection stricte) ; fusion ; cocher le sprint avec la PR et le SHA ; mettre à jour la section « État ».

## Pièges connus

- `@koklo/ui` est consommé par `dist` : `pnpm --filter @koklo/ui build` avant les tests web, et pas pendant qu'une
  suite Playwright web tourne.
- Les e2e laissent `e2e/playwright-report/` : `biome ci` du paquet `e2e` le lint et échoue (3 700 erreurs). Le
  supprimer avant `pnpm lint`.
- e2e racine sur la vraie pile (Postgres en Compose, API, worker, web) : `pnpm e2e` lance tout ; pour un seul fichier,
  copier `e2e/scripts/run.ts` en ajoutant le fichier et `--workers=1` aux arguments de `playwright test`, puis supprimer
  la copie.
- Captures : comparer en RGB ; `getbbox()` sur une image RGBA ne regarde que l'alpha.
- Un test qui parcourt le contrat oRPC doit descendre dans les sous-groupes (ex. `idea.page`).
- Une PR bloquée en « queued » : annuler l'exécution CI périmée (`gh run cancel`) qui occupe la file.

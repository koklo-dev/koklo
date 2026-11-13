---
doc_version: 0.1.0
status: accepted
last_reviewed: 2026-11-13
covers_commit: 7f6d604a
---
# 0022 — Diagramme : lecteur SVG maison et placement `@dagrejs/dagre` 3.1.3

- **Statut** : accepté le 2026-11-13 (TK-108, lot A ; la passation 09 §3.4 nomme déjà le placement dagre)
- **Date** : 2026-11-13
- **Décideurs** : developer, designer (ticket TK-108)

## Contexte
L'onglet Diagramme du modèle de données montre les tables et leurs relations, avec zoom, sélection et, pour l'équipe, déplacement des tables. Le même lecteur doit resservir pour d'autres diagrammes (flux, infrastructure) : il ne connaît donc ni « table » ni « champ ». Contraintes : WCAG 2.2 AA (clavier, 2.5.7 alternative au glisser, lecteurs d'écran), thème par jetons, 375 px, aucune sortie du modèle rendue en HTML.

## Options envisagées
| Option | Avantages | Inconvénients |
|--------|-----------|---------------|
| A. SVG maison (traits) + cartes en `button` + `@dagrejs/dagre` pour les positions | Cartes et traits aux jetons du design system ; chaque table est un vrai `button` (focus, `aria-pressed`) ; pas de dépendance de rendu ; dagre MIT, **aucune faille connue** sur `@dagrejs/dagre` 3.1.3 et `@dagrejs/graphlib` 4.0.6 (OSV, 2026-11-13) | Zoom, défilement et glisser à écrire (une centaine de lignes chacun, testés) |
| B. React Flow | Zoom, glisser, mini-carte fournis | Gros paquet et styles propres à surcharger ; nœuds et poignées peu accessibles au clavier ; le thème par jetons se rejoue entièrement |
| C. Rendu du texte Mermaid | Aucune dépendance de plus (le `model.mmd` existe) | Aucune sélection ni déplacement ; SVG injecté (HTML non maîtrisé) ; pas de clavier |

## Décision
Option A. `@dagrejs/dagre` **3.1.3**, version exacte, ajoutée aux dépendances de `@koklo/ui` seulement (licence MIT vérifiée au lockfile).
- **Placement** (`packages/ui/src/lib/diagram-layout.ts`, fonction pure) : `rankdir` LR, `nodesep` 40, `ranksep` 80, `ranker` network-simplex, marge 20. Les nœuds et relations sont triés par identifiant avant dagre : même résultat quel que soit l'ordre reçu. Les positions enregistrées (`data/_layout.yaml`) écrasent celles de dagre nœud par nœud. Dagre ne sert qu'aux positions ; les relations sont des traits droits entre centres, tracés par le lecteur.
- **API générique** : `DiagramViewer<T extends DiagramNode>` reçoit des nœuds de type libre (`id`, `name`, `width`, `height`) et `renderNode` rend leur contenu ; relations `{ from, to, label?, dashed? }`. Les groupes imbriqués (`compound`, champ `parentId`) sont prévus dans l'API mais pas dessinés : aucun besoin avant les diagrammes d'infrastructure.
- **Zoom** : paliers 50, 67, 75, 90, 100, 110, 125, 150, 200 ; « Ajuster » ; `Ctrl/⌘ + − 0` ; `Ctrl/⌘ + molette` par un écouteur natif non passif (sinon la page zoomerait), ancrée sous le pointeur.
- **Clavier et lecteurs d'écran** : région défilante focusable et nommée ; chaque nœud est un `button` `aria-pressed` ; Tab suit l'ordre des identifiants ; le SVG et les étiquettes des relations sont `aria-hidden` (les relations se lisent dans la fiche) ; une seule région `role="status"` annonce le zoom et « {nom} déplacée » ; alternative au glisser : Alt + flèches (20 px) ; pas de glisser sous 768 px.

## Conséquences
- `@dagrejs/dagre` n'est importé que par `diagram-layout.ts` ; aucune application ne l'importe.
- Une dépendance de production de plus à suivre dans `dependency-audit` (dagre et sa dépendance `@dagrejs/graphlib`).
- Les diagrammes futurs (flux, infrastructure) réutilisent le lecteur en fournissant leurs nœuds et leur `renderNode`.

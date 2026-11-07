# Refonte UI · Lots 0 et 1 : passation à l'agent dev

> Validé par Brice le 05/11/2026. **Mise à jour du 05/11 (après-midi)** : navigation de projet restructurée autour du groupe « Spec » et des 6 livrables du cadrage (§1.1, §1.2, §1.3, §1.5).
> Maquettes de référence : canevas « Koklo — maquettes » (copie locale qui fait foi : `docs/refonte/maquettes/04-Lot0Fondations.html` ; `docs/refonte/maquettes/05-Lot1Shell.html` ; lire le code avec `pnpm maquette <numéro>`), planches **Lot 0 · Fondations v2** et **Lot 1 · Shell projet et navigation**.
> Plan d'ensemble : doc « Koklo — Refonte UI/UX et espace Idée : audit et plan » (https://claude.ai/artifact/3LVANUqXWDENdWVbhAiNRS).

Ce fichier remplace, pour ces deux lots, toute décision contraire dans `DESIGN.md` v1 et dans les fiches `design/screens/*.md`. L'étape Design du workflow `koklo-delivery` reporte ces décisions dans `DESIGN.md` (v2) puis dans les fiches touchées.

## Règles ajoutées à l'étape Design (à copier dans le prompt du sous-agent designer)

1. Pas de texte explicatif sauf si l'utilisateur risque une erreur. Une règle se traduit d'abord en état, en icône ou en infobulle.
2. Une action principale par écran, toujours à droite du titre, dans `ProjectHeader`.
3. Toute page de projet utilise `AppShell` + `ProjectHeader` et les composants de statut ci-dessous. Aucun badge de statut fait main.
4. Pas de nouvel écran ni de `Sheet` sans planche validée sur le canevas.
5. Un seul message par situation : jamais la même information dans la région d'état et dans une alerte visible en même temps.

---

## Lot 0 · Fondations

### 0.1 Jetons (remplacent DESIGN.md §2.1)

Nouveaux jetons : `--surface`, `--raised`, `--border-strong`. Le reste reprend v1.

```css
:root {
  --background: #ffffff;   /* contenu */
  --surface: #f7f5ff;      /* barre latérale, en-têtes de tableau, groupes */
  --raised: #ffffff;       /* popover, panneau, aperçu */
  --foreground: #14102b;
  --muted-foreground: #55507a;
  --border: #e6e1f8;
  --border-strong: #cfc7ee;  /* pointillés, désactivé, crans vides */
  --primary: #5b3fd9;
  --primary-foreground: #ffffff;
  --secondary: #eeeaff;      /* = soft */
  --secondary-foreground: #43299f;
  --ring: #5b3fd9;
  --radius: 0.5rem;
}
.dark {
  --background: #0d0b1c;
  --surface: #15122b;
  --raised: #1d1838;
  --foreground: #f1efff;
  --muted-foreground: #a9a3d4;
  --border: #2a2550;
  --border-strong: #3d3670;
  --primary: #9b87ff;
  --primary-foreground: #0d0b1c;
  --secondary: #231d4a;
  --secondary-foreground: #cbc1ff;
  --ring: #9b87ff;
}
```

Usage : barre latérale sur `--surface`, contenu sur `--background`, éléments flottants sur `--raised` avec ombre `0 8px 24px rgb(20 16 43 / .12)` (en sombre, la bordure suffit). `--primary` uniquement pour : action principale, élément de navigation actif (icône), fil de phase, sélection.

Couleurs d'alerte (fond / bordure / texte) :

| Variante | Clair | Sombre |
|---|---|---|
| Neutre | `--surface` / `--border` / `--foreground` | `--raised` / `--border` / `--foreground` |
| Attention | `#fffbeb` / `#fcd34d` / `#78350f` | `#3a2a0c` / `#78350f` / `#fde68a` |
| Erreur | `#fef2f2` / `#fca5a5` / `#991b1b` | `#3b1219` / `#7f1d1d` / `#fecaca` |

### 0.2 Typographie (remplace DESIGN.md §3, échelle)

| Usage | Taille / graisse | Interlettrage |
|---|---|---|
| Titre de page (h1) | 24 / 600 | −0,02 em |
| Section (h2) | 16 / 600 | normal |
| Sous-section (h3) | 14 / 600 | normal |
| Corps | 14 / 400 | normal |
| Secondaire | 13 / 400, `--muted-foreground` | normal |
| Libellé de groupe (barre) | 11 / 600, capitales, +0,06 em | — |
| Code, identifiants | JetBrains Mono 12 / 500 | normal |

Plus aucun h1 à 30 px, plus de h2 à 22 px.

### 0.3 Composants (`packages/ui`)

**`LifecycleStatus`** — cycle de vie calculé d'une fonctionnalité.
- Props : `stage: 0..5` (Idée, Spécifiée, Conçue, Implémentée, Testée, Livrée).
- Pastille 24 px de haut, fond `--secondary`, texte `--foreground` ; jauge de 6 crans de 5×5 px (rayon 2) en `currentColor`, crans non atteints à 22 % d'opacité, puis le libellé.
- `stage = 5` : fond et texte « Validée » (vert) de la palette ci-dessous.
- `aria-label` : « Avancement : Conçue, étape 3 sur 6 ».

**`ValidationStatus`** — validation client. Palette DESIGN.md v1 §2.2 inchangée (Validée, À valider, À revoir) + `Non soumise` (fond `--secondary`, texte `--muted-foreground`, icône `remove`). Icône remplie (FILL 1), 16 px.

**`DeliverableStatus`** — statut d'un livrable du cadrage (nouveau, voir §1.1) : À faire (`radio_button_unchecked`, neutre), En cours (`edit`, neutre), À valider (`schedule`, ambre de `ValidationStatus`), Validé (`check_circle`, vert). Même gabarit de pastille que `ValidationStatus`, variante compacte 11 px pour la barre latérale.

**`PriorityIndicator`** — 3 barres verticales de 3 px (hauteurs 4, 8, 12 px), barres actives en `--foreground`, inactives en `--border-strong`, puis le libellé (Indispensable 3, Importante 2, Souhaitable 1, Reportée 0). Remplace le gras/gris actuel.

**`EntityChip`** — identifiant cliquable : `F-nnn`, `S-slug`, `TK-nnn`, `RL-slug`, `T-slug`, `R-nnn`, `E-slug`, SHA. Fond `--secondary`, texte `--secondary-foreground`, icône 16 px selon le type (`task_alt`, `web`, `view_kanban`, `person`, `table`, `gavel`, `api`, `commit`), identifiant en JetBrains Mono 12/500, titre optionnel en `--foreground`. Rayon 6 px, 26 px de haut. Survol ou focus : `HoverCard` sur `--raised` avec titre et une ligne de résumé. Toujours un vrai lien.

**`InlineAlert`** — une ligne, 40 px min : icône 18, texte, action optionnelle (bouton texte souligné, 600). Variantes neutre / attention / erreur. Rôles : `note` (neutre), `status` (attente, compte à rebours), `alert` (échec). Détails dépliables sous la ligne si besoin.
- **Cas imposé — bloc Anthropic** (décision du 05/11) : `InlineAlert` neutre, icône `lock`, texte « Votre texte est envoyé à Anthropic avec la clé de l'organisation. », action « Détails » qui déplie les 5 phrases actuelles de S-framing §3.2. Toujours rendu dans le DOM avant toute requête.

**`EmptyState`** — cadre pointillé `--border-strong` sur `--surface`, rayon 12 ; tuile icône 48 px (`--secondary`), titre 14/600, une phrase 13 px, une seule action principale.

**`PhaseRail`** — fil de phase Idée → Cadrage → Baseline 0 → Itérations.
- Grand : pastille 32 px par étape (terminée : `--primary` plein + `check` ; en cours : `--secondary` + anneau 2 px `--primary` ; à venir : `--surface` + bordure), trait de 2 px entre étapes (`--primary` si terminé), libellé 14/600 + état en `--muted-foreground`, sous-titre 13 px.
- Miniature (`PhaseRail size="sm"`) : 4 traits de 12–14×4 px (terminé `--primary`, en cours `--primary` à 45 %, à venir `--border-strong`) + « Cadrage · 2 sur 4 ».
- Phase calculée côté serveur ; si non disponible au lot 1, dériver : aucune fonctionnalité = Idée, pas de `baseline-0` = Cadrage, sinon Itérations.

**Boutons** : principal (`--primary`), secondaire (bordure `--border`, fond `--background`), discret (transparent). **Désactivé** : bordure pointillée `--border-strong`, fond `--surface`, texte `--muted-foreground` (plus de lavande délavée), et toujours une raison visible à côté (`aria-describedby`).

### 0.4 Galerie

Route `/dev/ui` (équipe seulement, hors production ou derrière un drapeau) qui montre chaque composant dans tous ses états, en clair et en sombre. Les tests de captures la photographient.

### 0.5 Critères d'acceptation du lot 0

- [ ] Jetons de 0.1 dans `globals.css` ; aucune couleur en dur dans `apps/web` (test de garde existant étendu aux nouveaux jetons).
- [ ] Les 8 composants de 0.3 dans `packages/ui`, avec tests (rendu, `aria-label`, variantes) et axe sans violation en clair et en sombre.
- [ ] Les écrans existants remplacent leurs badges de statut et de priorité par ces composants (S-features, S-framing, S-kanban, S-github).
- [ ] Le bloc Anthropic passe en `InlineAlert` + « Détails » dans S-framing et S-ai-settings.
- [ ] Échelle typographique 0.2 appliquée partout (h1 24 px).

---

## Lot 1 · Shell et navigation

### 1.0 Les 6 livrables du cadrage (décision du 05/11)

Le cadrage n'est plus une liste de fonctionnalités : c'est 6 livrables de la spec qui avancent en parallèle (conception v0.6 §4). La Baseline 0 se pose quand les 6 sont validés.

| Livrable | Entrée de navigation | Contenu dans le dépôt de spec | Validation |
|---|---|---|---|
| Cahier fonctionnel | Fonctionnel (`task_alt`) | `features/`, `domain/rules/`, `domain/roles.yaml`, `design/flows/` (parcours) | **Client, obligatoire** |
| Design | Design (`palette`) | `design/screens/`, `design/flows/`, `design/tokens/`, `design/components/` | **Client, obligatoire** |
| Modèle de données | Données (`database`) | `data/tables/`, `data/relations.yaml`, `design/fixtures/` | Équipe ; le client lit et commente |
| Architecture | Architecture (`account_tree`) | `architecture/overview.md`, `architecture/adr/` | Équipe ; le client lit et commente |
| Cahier technique | Technique (`terminal`) | `tech/cahier-technique.md`, `api/endpoints/`, `nfr/` | Équipe ; le client lit et commente |
| Qualité | Qualité (`fact_check`) | `tests/scenarios/` | Équipe ; le client lit et commente |

Au lot 1, seuls Fonctionnel (= l'écran Fonctionnalités actuel) et la structure de navigation sont livrés. Les autres entrées affichent un `EmptyState` « Bientôt » (pas de lien mort) jusqu'à leur lot (plan : lots 6 à 12). Le statut de chaque livrable est calculé côté serveur ; tant qu'il n'existe pas, l'entrée n'affiche pas de pastille.

### 1.1 `AppShell`

- Barre latérale **collante, pleine hauteur** (`position: sticky; top: 0; height: 100dvh`), défilement interne si nécessaire. Corrige : barre centrée verticalement sur les pages longues (S-framing), rail replié flottant au milieu de l'écran (S-framing rate-limited).
- Largeur 256 px ; repliée : rail de 64 px, icônes seules avec `aria-label` et infobulle. État mémorisé en `localStorage` (try/catch).
- Fond `--surface`, bordure droite `--border`.
- Sous 768 px : la barre devient un tiroir (`Sheet` à gauche) ouvert par un bouton menu dans l'en-tête.

Contenu, de haut en bas :
1. **Sélecteur d'organisation** : tuile 32 px (initiales sur `--primary`), nom, « Organisation · <rôle> », `unfold_more`.
2. **Recherche** : bouton 34 px « Rechercher » + `⌘K` (`Ctrl K` hors Mac). Ouvre un `CommandDialog` : projets, fonctionnalités (`F-nnn`), tickets, pages. Recherche locale sur les données déjà chargées au lot 1.
3. **Groupe « Projet »** (visible si un projet est actif) :
   - Carte sélecteur de projet : nom en 600, `PhaseRail size="sm"`, `unfold_more`. Ouvre la liste des projets + « Créer un projet ».
   - Navigation, dans cet ordre :
     - Vue d'ensemble (`space_dashboard`)
     - Idée (`lightbulb`) — pastille « N à relire » en `--primary` quand des propositions de l'agent attendent
     - Assistant de cadrage (`auto_awesome`) — l'actuel S-framing
     - **Groupe dépliable « Spec »** : en-tête 12 px capitales `--muted-foreground`, chevron, compteur mono « 2/6 validés » ; `aria-expanded`. Six sous-entrées, indentées de 22 px, 32 px de haut, 13 px, icônes 18 : Fonctionnel, Design, Données, Architecture, Technique, Qualité, chacune avec son `DeliverableStatus` compact à droite.
     - Tickets (`view_kanban`) — compteur du sprint
   - Élément actif : fond `--background`, contour 1 px `--border`, texte 600, icône remplie en `--primary`, `aria-current="page"`.
   - Rail replié : l'en-tête « Spec » devient un trait de 24 px ; les sous-entrées restent en icônes avec `aria-label` « Spec · Fonctionnel ».
4. **Groupe « Organisation »** : Tous les projets (`folder_open`), Réglages (`settings`).
5. **Pied** : « Replier la barre » ; compte (avatar, nom, e-mail) + bouton thème clair / sombre.

Supprimés de la barre : la liste de projets en vrac, Kanban au niveau organisation, Membres, GitHub, IA (déplacés dans Réglages).

### 1.2 Routes

| Entrée | Route | Remarque |
|---|---|---|
| Vue d'ensemble | `/projects/[projectId]` | Lot 3. Au lot 1 : redirection vers Spec · Fonctionnel |
| Idée | `/projects/[projectId]/idea` | Lot 2. Au lot 1 : `EmptyState` « Bientôt » |
| Assistant de cadrage | `/projects/[projectId]/framing` | Existant |
| Spec · Fonctionnel | `/projects/[projectId]/spec/functional` (onglets `?tab=features|rules|roles|flows`) | Onglet Fonctionnalités = l'écran actuel ; `/features` redirige ici |
| Spec · Design | `/projects/[projectId]/spec/design` | Lot 10 |
| Spec · Données | `/projects/[projectId]/spec/data` | Lot 7 |
| Spec · Architecture | `/projects/[projectId]/spec/architecture` | Lot 8 |
| Spec · Technique | `/projects/[projectId]/spec/technical` | Lot 9 |
| Spec · Qualité | `/projects/[projectId]/spec/quality` | Lot 11 |
| Tickets | `/projects/[projectId]/tickets` | Le kanban actuel déplacé ici, filtré par projet |
| Tous les projets | `/projects` | Existant |
| Réglages | `/settings/members`, `/settings/github`, `/settings/ai` | Une page à onglets (`Tabs` en liens) ; les trois écrans existants y entrent tels quels |

Le dernier projet ouvert est mémorisé ; `/` redirige vers lui, sinon vers `/projects`.

### 1.3 `ProjectHeader`

En haut de chaque page de projet, fond `--background`, bordure basse `--border`, marges 20/32/16 px.
- Ligne 1 (13 px, `--muted-foreground`) : nom du projet (lien vers la vue d'ensemble, en `--foreground` 500), « / », section (« Spec »), « / », page ; à droite : `commit` + SHA de la spec + « spec à jour il y a N min ».
- Ligne 2 : h1 (24/600) — pour un livrable, son nom (« Cahier fonctionnel ») ; puis, pour un livrable, son statut de validation en pastille (« À valider par le client · obligatoire ») et un résumé court en 13 px (« 4 fonctionnalités validées sur 7 ») ; à droite, actions secondaires puis **l'action principale**.
- Ligne 3 (optionnelle) : **onglets de section** en liens (`nav` nommée), 36 px, actif souligné de 2 px en `--primary` et en 600, compteur en pastille `--secondary`. Les onglets reposent sur la bordure basse de l'en-tête. Pour Fonctionnel : Fonctionnalités, Règles métier, Rôles et permissions, Parcours.
- Remplace l'actuel fil d'Ariane « Koklo > Projets > X > Page » + sous-titre + ligne meta + compteur.

### 1.4 Bandeau « Prochaine étape » (optionnel au lot 1)

`InlineAlert` attention sous l'en-tête quand une action humaine est attendue (validations en attente, clé IA absente, spec en échec), avec une action. Une seule à la fois, la plus prioritaire. Si la donnée n'existe pas encore au lot 1, ne pas l'afficher (pas de faux contenu).

### 1.5 Spec · Fonctionnel, onglet Fonctionnalités (référence de la planche)

Le lot 1 ne refond pas S-features en profondeur, mais l'insère proprement :
- `ProjectHeader` : « Cahier fonctionnel », statut de validation client, résumé, actions « Cadrer avec l'IA » (secondaire) et « Nouvelle fonctionnalité » (principale), onglets Fonctionnalités / Règles métier / Rôles et permissions / Parcours. Au lot 1, les trois derniers onglets affichent un `EmptyState` « Bientôt ».
- Recherche (titre ou `F-nnn`) + filtres en puces pointillées « + Avancement », « + Validation », « + Priorité » à la place des deux `Select` à libellé.
- Tableau : en-tête sur `--surface` 12 px `--muted-foreground` ; lignes de 52 px ; colonnes ID (`EntityChip` sans titre), Fonctionnalité (titre 500 + ligne secondaire : nb de critères · écran lié), Avancement (`LifecycleStatus`), Validation (`ValidationStatus`), Priorité (`PriorityIndicator`), Mise à jour (13 px, alignée à droite). Tableau dans un cadre arrondi 12 px, défilement horizontal interne sous 760 px.
- Le reste de S-features (fiche en `Sheet`, formulaire) attend le lot 6.

### 1.6 Correctifs inclus

- [ ] Anneau de focus resté affiché sur le menu utilisateur en sombre (S-features data-dark) : `focus-visible` seulement.
- [ ] Kanban coupé à droite sans indice : défilement horizontal visible + ombre de bord.
- [ ] « Réessayez dans 30 s » affiché deux fois (S-framing rate-limited) : une seule occurrence (règle 5).

### 1.7 Critères d'acceptation du lot 1

- [ ] Tous les écrans connectés rendus dans `AppShell` ; captures clair / sombre / 375 px de chaque écran existant.
- [ ] Barre étendue, repliée et tiroir mobile testés au clavier (ordre de focus, `aria-current`, `aria-expanded` du groupe Spec, `aria-label` des icônes seules).
- [ ] Groupe « Spec » avec ses 6 entrées ; entrées non livrées en `EmptyState`, aucun lien mort.
- [ ] `⌘K` ouvre la palette, Échap la ferme, résultats navigables aux flèches.
- [ ] Kanban accessible sous `/projects/[projectId]/tickets` uniquement ; `/features` et l'ancienne route du kanban redirigent.
- [ ] Réglages regroupés ; plus aucune entrée Membres / GitHub / IA dans la barre.
- [ ] `ProjectHeader` (avec onglets là où ils existent) sur Assistant de cadrage, Spec · Fonctionnel, Tickets ; fil d'Ariane v1 retiré.

---

## Tickets à ajouter au sprint (format du vault)

```
- [ ] **[TK-?]** Refonte lot 0 : jetons v2, échelle typo, composants LifecycleStatus / ValidationStatus / DeliverableStatus / PriorityIndicator / EntityChip / InlineAlert / EmptyState / PhaseRail, galerie /dev/ui. Réf. design/refonte/lots-0-1-passation.md §Lot 0. `pkg:ui` `pkg:web`
- [ ] **[TK-?]** Refonte lot 1 : AppShell avec groupe Spec (6 livrables), ProjectHeader avec onglets, routes projet (/spec/*, tickets sous le projet), Réglages regroupés, palette ⌘K, correctifs 1.6. Réf. design/refonte/lots-0-1-passation.md §Lot 1. `pkg:web` — dépend du lot 0
```

Numéros à attribuer par le workflow. Le lot 1 dépend du lot 0.

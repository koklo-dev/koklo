<!-- Copie de koklo-new/cadrage/koklo-design-v0.1.md (source), aussi dans MyVault/koklo-v2/design.md. Mettre à jour la source puis recopier. v2 (TK-87) écrite d'abord ici : recopie vers les deux autres emplacements à faire par l'orchestrateur (docs/refonte/questions.md C5). -->
# Koklo : design (v2.24)

Décisions d'identité visuelle et d'interface de la plateforme Koklo (livraison produit de A à Z, web app + CLI). Document vivant : chaque décision porte son état (**retenu**, **à confirmer**, **écarté**).

Date : 26/10/2026 (v0.1) ; **v2 du 06/11/2026 (TK-87, lot 0 de la refonte)**, **v2.1 (TK-94, listes longues)**, **v2.2 du 07/11/2026 (TK-88, lot 1 : coquille de l'application)**, **v2.3 du 07/11/2026 (TK-88, finition : clavier de la palette, pied épinglé, ombre du kanban)**. La v2 reporte la passation `docs/refonte/passations/01-lots-0-1-passation.md` §0.1 à §0.4, validée le 05/11/2026, et la décision B15 (`docs/refonte/questions.md`). En cas de contradiction avec une fiche `design/screens/*.md` antérieure, ce document l'emporte. Maquettes : toutes dans `docs/refonte/maquettes/` (une page HTML par planche, liste dans `index.html`) ; planche de ce document : **Lot 0 · Fondations v2** (`docs/refonte/maquettes/04-Lot0Fondations.html`). Ce document donne le cadre (jetons, typographie, accessibilité) ; pour un écran couvert par une planche de `docs/refonte/maquettes/`, la planche fait foi (règle du 07/11/2026, `.claude/CLAUDE.md`) : son code se lit avec `pnpm maquette <numéro>`, et un écart entre la planche et ce document se corrige ici.

## 1. Principes

- **Nouveau départ** : l'identité de l'ancien Koklo (orchestration d'agents, mascotte coq) est abandonnée. La marque se construit pour une plateforme de livraison produit.
- **shadcn/ui** pour les composants, réutilisés tels quels autant que possible (retenu).
- **Clair et sombre** dès le départ : le sombre est de première classe (CLI, agents, usage prolongé).
- **Jamais la couleur seule** : chaque statut a aussi une forme (icône, jauge, barres) et un libellé, pour l'accessibilité et pour ne pas dépendre de la teinte.
- **Cible double** : une vue client (validation, sans vocabulaire git) et une vue équipe (données, API, tests). L'identité doit rassurer l'une sans paraître jouet à l'autre.

### 1.1 Règles d'écran (v2, retenu, passation 01)

1. Pas de texte explicatif sauf si l'utilisateur risque une erreur. Une règle se traduit d'abord en état, en icône ou en infobulle.
2. Une action principale par écran, toujours à droite du titre, dans `ProjectHeader` (lot 1).
3. Toute page de projet utilise `AppShell` + `ProjectHeader` et les composants de statut du §5.1. **Aucun badge de statut ni de priorité fait main.**
4. Pas de nouvel écran ni de `Sheet` sans planche validée dans `docs/refonte/maquettes/`.
5. Un seul message par situation : jamais la même information dans la région d'état et dans une alerte visible en même temps.
6. **On ne nomme jamais le fournisseur d'IA dans l'interface** (décision B15 du 06/11/2026) : on dit « agent IA » ou « action IA ». Seul l'écran de réglage des clés (Réglages › Fournisseurs d'IA, lot 13) nomme le fournisseur d'une clé.
7. Aucune couleur en dur hors de `packages/ui/src/styles/*.css` : tout le reste passe par les jetons (garde par glob sur `apps/web/src/**` et `packages/ui/src/components/**`).

## 2. Couleurs : thème Indigo (retenu)

Un violet franc, volontairement éloigné du bleu classique des outils de gestion de projet. Le choix s'est fait entre Indigo et Forêt ; Forêt a été écarté après essai sur l'écran réel (rendu non satisfaisant). Cobalt et Vermillon n'ont pas été retenus.

### 2.1 Tokens (correspondance shadcn/ui)

v2 : trois niveaux de surface (`--background`, `--surface`, `--raised`), une bordure forte, le fond des propositions (`--diff-bg`, passation 02 §6.4) et l'ombre des éléments flottants. Les jetons v1 restent (beaucoup d'écrans les consomment) : `--muted` a la valeur de `--surface` et `--card` reste une carte posée sur le contenu ; `--popover` prend la valeur de `--raised` (en sombre `#15122b` → `#1d1838`). Les nouveaux écrans emploient `--surface` et `--raised`, et non plus `--muted`, pour une surface.

```css
:root {
  --background: #ffffff;           /* contenu */
  --surface: #f7f5ff;              /* barre latérale, en-têtes de tableau, groupes, vides */
  --raised: #ffffff;               /* popover, panneau, aperçu */
  --foreground: #14102b;
  --card: #ffffff;
  --card-foreground: #14102b;
  --popover: #ffffff;              /* = --raised */
  --popover-foreground: #14102b;
  --primary: #5b3fd9;
  --primary-foreground: #ffffff;
  --secondary: #eeeaff;            /* = soft */
  --secondary-foreground: #43299f;
  --muted: #f7f5ff;                /* = --surface (alias v1) */
  --muted-foreground: #55507a;
  --accent: #eeeaff;
  --accent-foreground: #43299f;
  --destructive: #b91c1c;          /* à confirmer */
  --border: #e6e1f8;
  --border-strong: #cfc7ee;        /* pointillés, désactivé, crans et barres vides */
  --input: #e6e1f8;
  --ring: #5b3fd9;
  --diff-bg: #faf8ff;              /* proposition de l'agent dans un document (lot 2) */
  --shadow-floating: 0 8px 24px rgb(20 16 43 / .12);
  --radius: 0.5rem;
}

.dark {
  --background: #0d0b1c;
  --surface: #15122b;
  --raised: #1d1838;
  --foreground: #f1efff;
  --card: #15122b;
  --card-foreground: #f1efff;
  --popover: #1d1838;              /* = --raised */
  --popover-foreground: #f1efff;
  --primary: #9b87ff;
  --primary-foreground: #0d0b1c;
  --secondary: #231d4a;
  --secondary-foreground: #cbc1ff;
  --muted: #15122b;                /* = --surface (alias v1) */
  --muted-foreground: #a9a3d4;
  --accent: #231d4a;
  --accent-foreground: #cbc1ff;
  --destructive: #f87171;          /* à confirmer */
  --border: #2a2550;
  --border-strong: #3d3670;
  --input: #2a2550;
  --ring: #9b87ff;
  --diff-bg: #1a1536;
  --shadow-floating: none;         /* en sombre, la bordure suffit */
}
```

Usage (retenu) :
- Barre latérale sur `--surface`, contenu sur `--background`, éléments flottants (popover, menu, liste de `Select`, `Sheet`, infobulle, `HoverCard`) sur `--raised` avec `--shadow-floating` et une bordure `--border`. Aucun `shadow-md` ni `rgb(` dans un composant : le jeton seul. L'infobulle n'est plus inversée (fond `--foreground` en v1) : elle suit les autres éléments flottants, sur tous les écrans. La barre latérale est sur `--surface` depuis `AppShell` (v2.2, TK-88 ; questions.md B29) : dans `theme.css`, `--sidebar` passe de `var(--card)` à `var(--surface)` (le test `sidebar-tokens` suit) ; l'élément actif passe en `--background` avec un contour `--border` (§5.4), pas en `--accent`.
- `--primary` **uniquement** pour : action principale, élément de navigation actif (icône), fil de phase, sélection.
- `--border-strong` pour les pointillés (désactivé, `EmptyState`, filtres en puces), les crans et barres non atteints. Ce sont des repères décoratifs : le sens est toujours porté par un texte (contraste 1,5 à 1,8:1, non soumis à 1.4.11).

L'accent (`--primary`) est réglable : variantes testées en clair `#5b3fd9` (défaut), `#6d3fe0`, `#4c3fd1`, `#7a3fd9` ; en sombre `#9b87ff` (défaut), `#a98bff`, `#8f87ff`, `#b48bff`. **À confirmer** après quelques jours d'usage.

Contrastes vérifiés (WCAG 2.2, calcul relatif) : `--foreground` sur `--background` 18,4 / 17,1 (clair / sombre), sur `--surface` 17,1 / 16,1, sur `--raised` 18,4 / 14,9, sur `--secondary` 15,7 / 13,8 ; `--muted-foreground` sur `--background` 7,5 / 8,2, sur `--surface` 6,9 / 7,7, sur `--raised` 7,5 / 7,2, sur `--secondary` 6,3 / 6,6 ; `--secondary-foreground` sur `--secondary` 8,7 / 9,4 ; `--primary-foreground` sur `--primary` 6,7 / 6,8.

### 2.2 Couleurs de statut (identiques quel que soit le thème de marque)

| Statut | Clair (fond / texte) | Sombre (fond / texte) | Icône |
|---|---|---|---|
| Validée | `#dcfce7` / `#166534` | `#14532d` / `#bbf7d0` | `check_circle` (pleine) |
| À valider | `#fef3c7` / `#92400e` | `#78350f` / `#fde68a` | `schedule` (pleine) |
| À revoir | `#fee2e2` / `#991b1b` | `#7f1d1d` / `#fecaca` | `edit_note` (pleine) |
| Non soumise | `--secondary` / `--muted-foreground` | `--secondary` / `--muted-foreground` | `remove` (pleine) |

Contrastes : Validée 6,5 / 7,5 ; À valider 6,4 / 7,3 ; À revoir 6,8 / 6,9 ; Non soumise 6,3 / 6,6.

Couleurs d'alerte (fond / bordure / texte), v2 :

| Alerte | Clair | Sombre |
|---|---|---|
| Neutre | `--surface` / `--border` / `--foreground` | `--raised` / `--border` / `--foreground` |
| Attention | `#fffbeb` / `#fcd34d` / `#78350f` | `#3a2a0c` / `#78350f` / `#fde68a` |
| Erreur | `#fef2f2` / `#fca5a5` / `#991b1b` | `#3b1219` / `#7f1d1d` / `#fecaca` |

Contrastes du texte sur le fond : Neutre 17,1 / 14,9 ; Attention 8,8 / 11,1 ; Erreur 7,6 / 11,3. Ces couleurs vivent dans `packages/ui/src/styles/status.css` (`--alert-<neutral|warning|error>-<bg|border|fg>`) ; la variante neutre est un alias des jetons de §2.1.

Règle : la marque (violet) n'est jamais utilisée pour un statut ni pour une alerte. Les contrastes des paires texte/fond atteignent le niveau AA (4,5:1), vérifiés par `packages/ui/test/contrast.test.ts`.

## 3. Typographie (retenu : association « Humaniste et nette »)

| Rôle | Police | Graisses | Licence |
|---|---|---|---|
| Interface et titres | **Instrument Sans** | 400, 500, 600, 700 | OFL |
| Code, identifiants (`F-001`, `S-register#n-email`), commandes | **JetBrains Mono** | 400, 500 | OFL |

Échelle v2 (retenu, resserrée : plus aucun h1 à 30 px ni h2 à 22 px) :

| Usage | Taille / graisse | Interlettrage | Utilitaire |
|---|---|---|---|
| Titre de page (h1) | 24 / 600 | −0,02 em | `text-page-title` |
| Section (h2) | 16 / 600 | normal | `text-section-title` |
| Sous-section (h3) | 14 / 600 | normal | `text-subsection-title` |
| Corps | 14 / 400 | normal | `text-body` |
| Secondaire | 13 / 400, `--muted-foreground` | normal | `text-meta` (+ `text-muted-foreground`) |
| Libellé de groupe (barre) | 11 / 600, capitales | +0,06 em | `text-group-label` (+ `uppercase`) |
| Pastilles, identifiants de puce | 12 / 500 | normal | `text-caption` |
| Code, identifiants | JetBrains Mono 12 / 500 | normal | `text-code` (+ `font-mono`) |

- Les utilitaires sont exposés à Tailwind par `@theme` à partir des variables de `packages/ui/src/styles/typography.css` ; aucune taille arbitraire (`text-[30px]`, `text-[22px]`, `text-[24px]`, `text-[13px]`) dans un fichier touché. Le secondaire s'appelle `text-meta` pour ne pas entrer en collision avec la couleur `text-secondary`.
- La ligne « Pastilles 12/500 » reprend la légende v1 : la passation 01 §0.2 ne la liste plus, mais les composants de §5.1 l'emploient (questions.md B28).
- Hauteur de ligne : celle héritée (1,5), comme sur la planche ; la passation n'en fixe pas d'autre.

Écartées : Geist (trop neutre), Fraunces + Geist (serif éditorial), Bricolage Grotesque + Hanken Grotesk (trop expressif pour des tableaux denses). Le serif reste une option **pour le futur site vitrine**, pas pour l'application.

À faire en production : héberger les polices soi-même (par exemple Fontsource ou `next/font`) plutôt que de dépendre de Google Fonts au chargement.

## 4. Icônes : Material Symbols (retenu)

- Famille **Material Symbols Rounded** (Google, licence Apache 2.0) : angles et extrémités arrondis, en accord avec les rayons de l'interface. Le style Outlined a été essayé d'abord, puis remplacé.
- Réglages par défaut : graisse **400**, remplissage **0** (contour), `GRAD` 0, taille optique égale à la taille, entre 20 et 48.
- **Remplissage 1** pour l'état actif (élément de navigation sélectionné), pour les icônes de statut et pour les étapes terminée et en cours du fil de phase.
- Tailles (v2.6, TK-138) : 14 (`Pill` sm), 16 (pastilles de statut, puces d'entité, boutons `xs` et `sm`), 18 (`InlineAlert`, fil de phase, `IconButton` 32), 20 (boutons, navigation), 22 (navigation), 24 (disque d'étape), 28 (tuile d'`EmptyState`, galerie). Prop `tone` facultative : `muted`, `primary`, `success` (`--status-validated-fg`), `danger` (`--destructive`) ; sans `tone`, `currentColor`.
- **Correspondances avec les planches (v2.6)** : l'icône de l'agent des planches (`auto_awesome`, absente du jeu `@material-symbols/svg-400`) devient **`wand_stars`** pour les actions de l'agent (proposer, proposition, relecture), `smart_toy` restant à l'Assistant de cadrage (I23, décision de l'utilisateur) ; `expand_more` des planches devient **`keyboard_arrow_down`** pour le dépliage (I24).

| Domaine | Icônes |
|---|---|
| Navigation | `home`, `checklist`, `web`, `account_tree`, `chat_bubble`, `bar_chart`, `view_kanban`, `lightbulb` |
| Validation | `task_alt`, `check_circle`, `schedule`, `edit_note`, `fact_check`, `remove` |
| Livrables | `radio_button_unchecked`, `edit`, `schedule`, `check_circle` |
| Entités (`EntityChip`) | `task_alt` (F), `web` (S), `view_kanban` (TK), `person` (RL), `table` (T), `gavel` (R), `api` (E), `commit` (SHA) |
| Phase | `check`, `lightbulb`, `edit_note`, `flag`, `sync` |
| Versions | `commit`, `call_split`, `merge`, `difference`, `history` |
| Données et technique | `database`, `api`, `palette`, `smart_toy`, `terminal` |
| Interface | `add`, `search`, `link`, `person`, `settings`, `lock`, `visibility`, `warning`, `error`, `unfold_more`, `light_mode`, `dark_mode`, `wand_stars`, `keyboard_arrow_down`, `progress_activity`, `check_box`, `check_box_outline_blank`, `content_copy`, `swap_horiz`, `person_add`, `badge`, `key`, `arrow_forward`, `expand_less` (v2.6), `corporate_fare` (compte GitHub de type organisation, boîte « Nouveau projet », TK-93) |
| Statuts de ticket (kanban, TK-35) | `inbox` (backlog), `radio_button_unchecked` (à faire), `play_circle` (en cours), `fact_check` (en revue), `block` (bloqué), `check_circle` (terminé), `cancel` (annulé) |

À ajouter au registre du générateur au lot 0 (`packages/ui/scripts/generate-icons.ts`) : `remove`, `edit`, `view_kanban`, `gavel`, `table`, `error`, `flag`, `sync`, `lightbulb`.

Mise en œuvre :
- shadcn/ui utilise **Lucide** dans ses composants (chevrons, coches, croix). Il faudra remplacer ces imports dans les composants copiés dans le projet.
- En production, ne pas embarquer la police d'icônes complète (lourde) : utiliser des **SVG chargés à la demande** (Iconify avec le jeu `material-symbols`, ou le paquet `@material-symbols/svg-400`).
- Dans la spec Koklo, les icônes sont des assets de type `icône`, référencés par identifiant (jamais de chemin libre), comme le prévoit la bibliothèque d'assets.

## 5. Formes et composants

- Rayons (v2.6, TK-138, I8, I9) : boutons **6 px**, champs **8 px**, puces d'entité et pastilles d'identifiant **6 px**, alertes d'une ligne **10 px** (bandeau `banner` **12 px**), sous-cartes, lignes, aperçus et toasts **10 px** (jeton `--radius-card`), cartes, panneaux et cadres (`EmptyState`, tableaux) **12 px**, dialogue **14 px** (jeton `--radius-dialog`), pastilles de statut **pastille complète**. `--radius: 0.5rem` côté shadcn.
- Hauteurs (v2.6, I1, I2) : boutons **28 / 32 / 36 / 40** (`xs`, `sm`, `default`, `lg`), champs **40 px** dans un formulaire et **36 px** (`sm`) dans une barre d'outils ou un filtre (34 px dans la barre latérale) ; un bouton aligné sur une rangée de champs prend `lg` 40. Cibles tactiles de **44 px** à prévoir en mobile (**à faire**) ; minimum WCAG 2.2 (2.5.8) de 24 px partout.
- Bordures d'un pixel en `--border` plutôt que des ombres ; `--shadow-floating` réservée aux éléments flottants.
- Mise en page : barre latérale de **256 px** (rail replié de **64 px**, §5.4), panneau de détail de **380 à 440 px**, marge de page **32 px**. Les écrans « page » s'empilent sur mobile.
- Composants shadcn/ui prévus : `Table`, `Badge`, `Tabs`, `Button`, `Sheet`, `Card`, `Accordion`, `Alert`, `Select`, `Popover`, `HoverCard`, `Resizable`, `Avatar`, `DropdownMenu`.

### 5.1 Composants de statut et composants signature (v2, `packages/ui`, retenu)

Galerie de référence : `/dev/ui` (fiche `design/screens/S-dev-ui.md`), chaque composant dans tous ses états, en clair et en sombre.

**`LifecycleStatus`** : cycle de vie calculé d'une fonctionnalité.
- `stage: 0..5` : Idée, Spécifiée, Conçue, Implémentée, Testée, Livrée. Règles de la planche : Spécifiée = au moins un critère ; Conçue = liée à un écran ; Implémentée = une PR fusionnée la référence ; Testée = chaque critère a un test vert ; Livrée = présente dans une baseline. Au lot 0, le stade est dérivé côté web (questions.md B22).
- Pastille de 24 px, 12/500, fond `--secondary`, texte `--foreground` ; jauge de 6 crans de 5 × 5 px (rayon 2, écart 2 px) en `currentColor`, crans non atteints à 22 % d'opacité, puis le libellé.
- `stage = 5` : fond et texte « Validée » de §2.2.
- `aria-label` : « Avancement : Conçue, étape 3 sur 6 ». Jauge `aria-hidden`.

**`ValidationStatus`** : validation client. Remplace `StatusBadge` (qui reste un alias déprécié pour les écrans non refondus).
- `status: validated | pending | revise | unsubmitted` (Validée, À valider, À revoir, Non soumise), couleurs et icônes de §2.2, icône pleine de 16 px, pastille de 24 px, 12/500. Libellé texte toujours présent.
- `label` facultatif : libellé propre à l'écran pour un statut qui n'est pas une validation (proposition, installation), avec la tonalité la plus proche (questions.md B25). Icône : celle de la tonalité, ou `cancel` / `block` pour la tonalité Non soumise quand l'écran distingue rejet et suspension. Aucune autre icône.

**`DeliverableStatus`** : statut d'un livrable du cadrage. À faire (`radio_button_unchecked`, neutre), En cours (`edit`, teinte `soft`), À valider (`schedule`, couleurs À valider), Validé (`check_circle`, couleurs Validée). Neutre = fond `--secondary`, texte `--foreground`. Icône pleine pour tous les statuts sauf À faire (maquette 10 l.76). Prop `label` : libellé long (« À valider par le client · obligatoire »). Même gabarit que `ValidationStatus` ; variante `compact` : texte 11 px, icône 16 px, libellé masquable visuellement mais toujours présent pour les lecteurs d'écran (barre latérale du lot 1).

**`PriorityIndicator`** : 3 barres verticales de 3 px (hauteurs 4, 8, 12 px, écart 2 px, rayon 1, alignées en bas), actives en `--foreground`, inactives en `--border-strong`, puis le libellé 13/500. Indispensable 3, Importante 2, Souhaitable 1, Reportée 0. Barres `aria-hidden` : le libellé porte le sens. Variante `barsOnly` (v2.10, TK-141, planche 12 : ligne de liste) : barres de 4 px de large et de 6, 10, 14 px de haut, actives en `--primary`, sans libellé visible, `role="img"` nommé par le libellé. Remplace le gras / gris v1. Les tickets réutilisent le composant avec leurs propres libellés (critique 3, haute 2, moyenne 1, basse 0 ; questions.md B23).

**`EntityChip`** : identifiant cliquable `F-nnn`, `S-slug`, `TK-nnn`, `RL-slug`, `T-slug`, `R-nnn`, `E-slug`, SHA (7 caractères).
- Toujours un vrai lien (`<a href>`). Hauteur 26 px, rayon 6, marges 0 8 0 6 px, écart 6 px, fond `--secondary`, texte `--secondary-foreground`, icône 16 px selon le type (§4), identifiant en JetBrains Mono 12/500, titre facultatif 12 px en `--foreground`.
- Survol **ou focus** : `HoverCard` sur `--raised`, bordure `--border`, rayon 10, marges 12 / 14 px, `--shadow-floating`, largeur 300 px au plus : titre 14/600 (« F-001 · Connexion par e-mail ») et une ligne de résumé 13 px `--muted-foreground` (« 3 critères · liée à S-login »). L'aperçu n'est jamais essentiel : tout ce qu'il dit est atteignable en suivant le lien.

**`InlineAlert`** : une ligne de 40 px au moins (marges 6 8 6 12 px, rayon 10, texte 13 px) : icône 18 px, texte, une action facultative (bouton texte souligné, 600, 28 px de haut). Variantes et rôles : neutre `role="note"`, attention `role="status"` (attente, compte à rebours), erreur `role="alert"` (échec). Couleurs : §2.2. Un détail dépliable sous la ligne si besoin : l'action « Détails » est alors un `button` avec `aria-expanded` et `aria-controls`, et c'est la seule action de la ligne.
- **Cas imposé : bloc d'envoi à l'agent IA** (passation 01, décision B15) : `InlineAlert` neutre, icône `lock`, texte « Votre texte est envoyé à l'agent IA avec la clé de l'organisation. », action « Détails » qui déplie le détail de ce qui est envoyé (fiche S-framing §3.2). Toujours dans le DOM avant toute requête. Jamais le nom d'un fournisseur.

**`EmptyState`** : cadre pointillé `--border-strong` sur `--surface`, rayon 12, marges 28 / 20 px, centré ; tuile d'icône de 48 px (rayon 12, `--secondary`, icône 28 en `--secondary-foreground`, décorative), titre 14/600, une phrase 13 px `--muted-foreground` (280 px au plus), **une** action principale **plus au plus une action secondaire** (le chemin manuel) et une note facultative (`lock`) ; variantes `inline` (sans cadre ni tuile, dans une liste ; `bordered` v2.10 : cadre plein de la liste, bordure `--border` rayon 12 sur `--background`, pour la recherche sans résultat, planche 12), `start` (alignée à gauche) et `compact` (une ligne, sans icône) (v2.6, I20).

**`PhaseRail`** : fil de phase Idée → Cadrage → Baseline 0 → Itérations. C'est la signature de Koklo.
- Grand : liste ordonnée ; pastille de 32 px par étape (terminée : `--primary` plein, icône `check` en `--primary-foreground` ; en cours : `--secondary`, anneau de 2 px `--primary`, icône de l'étape en `--secondary-foreground` ; à venir : `--surface` + bordure `--border`, icône de l'étape en `--muted-foreground`), trait de 2 px entre les étapes (`--primary` si l'étape est terminée, sinon `--border`), libellé 14/600 suivi de l'état en 400 `--muted-foreground` (« terminée », « en cours », « à venir »), sous-titre facultatif 13 px. Icônes d'étape 18 px : Idée `lightbulb`, Cadrage `edit_note`, Baseline 0 `flag`, Itérations `sync`. L'étape en cours porte `aria-current="step"`.
- Navigable (v2.11, TK-9x) : `hrefs` (adresse par étape) et `LinkComponent` rendent le libellé et son état en lien, souligné au survol, anneau de focus `--ring` ; une étape sans adresse reste du texte. L'appelant décide quelles étapes sont ouvertes (terminées ou en cours, avec une page) ; l'étape en cours garde `aria-current="step"`.
- Miniature (`size="sm"`) : pastille de 28 px, bordure `--border`, 12/500 ; 4 traits de 14 × 4 px (rayon 2, écart 3 px ; terminé `--primary`, en cours `--primary` à 45 %, à venir `--border-strong`) + « Cadrage · 2 sur 4 ».
- Phase calculée côté serveur ; si elle manque (lot 1), dériver : aucune fonctionnalité = Idée, pas de `baseline-0` = Cadrage, sinon Itérations.

### 5.2 Boutons (v2, retenu)

- Principal (`--primary`, texte `--primary-foreground`), secondaire (bordure `--border`, fond `--background`), discret (transparent). tailles `xs` 28 (12/500, 0 10), `sm` 32 (13/500, 0 12 ; 0 12 0 10 avec icône 16), `default` 36 (14/500, 0 14 ; 0 14 0 12 avec icône 20), `lg` 40 (14/500, 0 16 0 12), rayon 6 (v2.6, I2).
- **Désactivé** : bordure **pointillée** `--border-strong`, fond `--surface`, texte `--muted-foreground`, quelle que soit la variante. Plus de lavande délavée (`opacity-50` supprimé).
- **Raison visible** : un bouton désactivé durablement (prérequis manquant, droits) a toujours sa raison à côté, en 13 px `--muted-foreground`, reliée par `aria-describedby`. Un bouton désactivé le temps d'une requête n'en a pas : la région d'état parle déjà (règle 5 ; questions.md B26).

### 5.3 Listes longues (v2.1, TK-94, retenu, passation 07 validée le 05/11/2026)

Règle de base : rien de ce qui vient de la base n'est chargé en entier. Le total est toujours celui du serveur, la recherche et les filtres s'appliquent au serveur, l'état vit dans l'URL (`?q=`, filtres, `?page=`, `?sel=`). Galerie de référence : `/dev/ui` (section « Listes longues », fiche `design/screens/S-dev-ui.md`) ; planche : `docs/refonte/maquettes/12-PrincipeListes.html`.

| Schéma | Usage | Composants |
|---|---|---|
| 1.1 Liste + fiche, défilement infini | parcourir et ouvrir un élément (fonctionnalités, règles, tickets par colonne, commentaires, sélecteurs) | `VirtualList`, `CountBar`, `ListFooter`, `EmptyState` (recherche vide) |
| 1.2 Tableau paginé | comparer, retrouver par position | `Pagination` |
| 1.3 Diagramme par zones | modèle de plus de 25 nœuds | `ZoneNode`, `DiagramMinimap` |
| 1.4 Relecture en volume | plus de 30 propositions | `GroupSection`, `CountBar` |

**`VirtualList`** (v2.8 : prop `framed`, cadre de rayon 12 ; prop `loadingRows`, lignes `SkeletonRow` sous les lignes chargées pendant l'arrivée d'une page) : liste à hauteur de ligne fixe (52 px, 44 px pour la relecture), seules les lignes visibles et 10 de marge sont dans le DOM. `role="list"` et `role="listitem"` conservés ; chaque ligne rendue porte `aria-setsize` (total du serveur) et `aria-posinset` (rang réel, 1 pour la première de la liste, pas de la fenêtre). Lignes séparées par une bordure basse `--border`, survol `--accent`, ligne sélectionnée : fond `--secondary` et bande de 3 px `--primary` à gauche (la sélection est portée aussi par `aria-current="true"`). La page suivante est demandée à **80 %** du défilement par une sentinelle (`IntersectionObserver`), sans clic ; le focus reste sur l'élément actif quand la liste grandit. Retour depuis une fiche : pages et position restaurées. Grilles de cartes : pages de 24, virtualisation par rangée.

**`CountBar`** : barre au-dessus de la liste, `role="status"`, 13 px. Format : **total et son nom en gras** (« 248 fonctionnalités ») · « N chargées » · compteur de filtre (« 31 à valider »), puis le tri à droite (« Tri : identifiant » puis `swap_vert`, v2.8). Avec une recherche (`query`) : « **0 résultat** pour « annulation groupée » ». La barre annonce aussi l'arrivée d'une page (« 50 fonctionnalités de plus chargées · 100 sur 248 ») ; une seule région d'état par écran (règle 5 du §1.1).

**`ListFooter`** (v2.8, TK-140, I22) : pied de liste d'**une ligne**, posé dans le cadre de la liste (`--surface`, bordure haute `--border`, marges 12 / 16, texte 13 `--muted-foreground`, icône 18, bouton `xs` 28), aligné à gauche, **quatre états** ; la variante `compact` du kanban garde le cadre pointillé `--border-strong` de rayon 12 :

| État | Icône | Texte | Action |
|---|---|---|---|
| Suite à charger | `expand_circle_down` | « Les 50 suivantes se chargent automatiquement en approchant du bas. » | « Charger la suite » (secondaire) |
| Chargement | `progress_activity` 18 `--primary` (`Spinner`, v2.6, I22) | « Chargement des 50 suivantes… » ; les lignes squelettes sont dans la liste, pas dans le pied | aucune ; `aria-busy="true"` |
| Erreur | `error` en `--alert-error-foreground` | « Impossible de charger la suite. Les N premières restent affichées. » en `--muted-foreground`, sur le fond `--alert-error`, sans bordure propre | « Réessayer » (`outline xs`) |
| Fin | `check` | « Fin de la liste · 248 fonctionnalités » | « Revenir en haut » (discret, `arrow_upward`), seulement si la liste dépasse deux écrans |

La **recherche sans résultat** n'est pas un état du pied : c'est un `EmptyState` (`search_off`, « Aucune fonctionnalité ne correspond à « … » », « La recherche porte sur les 248 fonctionnalités, pas seulement celles affichées. », action « Effacer la recherche »). Le texte varie avec le nom du type et le nombre de la page (50, 30 ou 24).

**`Pagination`** : `nav` « Pagination ». Texte « 1–25 sur 1 240 », précédent / suivant (`chevron_left`, `chevron_right`), numéros avec ellipses (`1 … 19 20 21 … 50`), page courante en `--primary` (`aria-current="page"`), taille de page 25 / 50 / 100 dans un `SegmentedControl xs` « Lignes par page » placé **avant** précédent (v2.6, I21). Rendu v2.8 : posée dans le cadre du tableau (`--surface`, bordure haute, marges 10 / 14) ; boutons précédent / suivant `outline` 32, numéros de 32 en mono 13 **bordés** `--border` (page courante `--primary`), ellipse de 32 sans bordure ; précédent et suivant désactivés sans texte de raison (une position n'est pas un prérequis manquant, B26) et la largeur de la barre ne bouge pas. Changer un filtre ou la taille revient en page 1. Pendant le changement de page, la page précédente reste visible en fondu (`motion-safe:`), sans saut de hauteur. Au-delà de 10 000 lignes : « environ 12 000 » et précédent / suivant seulement.

**`GroupSection`** : groupe repliable, en-tête collant sur `--surface` (48 de haut ; libellé 14/600 dans un bouton de 28 de marges 0 4 et d'écart 6, chevron 18 `keyboard_arrow_down` (I24), méta 12/400 « 42 · 18 acceptées · 22 à relire » à côté du bouton), bouton d'en-tête avec `aria-expanded`, action de groupe `outline xs` nommée avec son compte (« Accepter les 22 restantes ») et son icône `done_all` (`actionIcon`), **visible même replié**, rangée « Afficher 20 de plus · N restantes dans ce groupe » ; 8 éléments à l'ouverture. Variante `stacked` (v2.8) : sans cadre propre, séparée du groupe suivant par une bordure basse ; les groupes s'empilent dans un seul `ListPanel` ; la rangée « Afficher N de plus » est pleine largeur, 36, `--primary` 13/500, alignée à gauche, bordure haute.

**`DiagramMinimap`** (150 px, en bas à gauche, cadre de la vue en `--primary`, cliquable) et **`ZoneNode`** (cadre pointillé `--border-strong`, nom, icône, « 14 tables », aperçu) : composants du schéma 1.3, livrés dans la galerie au lot 0 des listes ; leurs écrans sont au lot 6.

Annonces et accessibilité (passation 07 §5) : arrivée d'une page annoncée en `role="status"` sans voler le focus ; « Charger la suite » toujours atteignable au clavier (le chargement à 80 % ne s'applique pas au clavier pur) ; pagination nommée, ellipses non focalisables ; groupes avec `aria-expanded`. Mouvement réduit : squelettes et fondus sous `motion-safe:`. Aucune couleur en dur : jetons seulement.

Écartées : pagination classique « Page 1, 2, 3 » pour les fonctionnalités (perd la position et le retour arrière), bouton « Afficher plus » seul (déjà en v1, jugé lent pour 1 000 éléments), tableau HTML virtualisé (la sémantique de table avec lignes absentes du DOM est mal lue par les lecteurs d'écran ; la liste avec `aria-setsize` est retenue par la passation).

### 5.4 Coquille de l'application (v2.3, TK-88, passation 01 §1, décision 05 §2 « Lot 1 », 21 §0, retenu)

Planches : `docs/refonte/maquettes/05-Lot1Shell.html` pour la mise en page, `10-Lot5Fonctionnel.html` pour la barre (la 05 est périmée sur « Spec 2/6 », le chevron et l'ordre : questions.md B2). Fiche : `design/screens/S-app-shell.md`.

**`AppShell`** : barre latérale à gauche, contenu à droite sur `--background`.
- Barre **collante pleine hauteur** (`position: sticky; top: 0; height: 100dvh`), **pied épinglé en bas** (« Replier la barre » / « Déplier la barre » dans le rail, v2.8 I28 ; identité, thème : v2.3) et seule la navigation au-dessus défile (sur un écran de moins de 900 px de haut, le groupe Organisation passe sous le pli et se rejoint par défilement ou au clavier ; B90), fond `--surface` (jeton `--sidebar`), bordure droite 1 px `--border`. Largeur **256 px** étendue, **64 px** repliée (icônes seules, `aria-label` et infobulle). État mémorisé en `localStorage` (try/catch ; sans stockage : étendue), plus de cookie. Raccourci `Ctrl B` / `⌘ B` conservé.
- Sous **768 px** : pas de barre, un en-tête de 56 px avec un bouton menu de 44 px (nom « Ouvrir le menu ») qui ouvre un tiroir `Sheet` à gauche de 288 px ; Échap ferme et rend le focus au bouton ; le tiroir se ferme après une navigation.
- Contenu, de haut en bas (marges internes 12 px, écart de groupe 16 px) : **sélecteur d'organisation** (tuile de 32 px, initiales 12/700 (14/700 au-delà de 32 px, I10) `--primary-foreground` sur `--primary`, rayon 8 ; nom 14/600 ; « Organisation · <rôle> » 12 px `--muted-foreground` ; `unfold_more`) ; **recherche** (bouton de 34 px, bordure `--border`, fond `--background`, rayon 6, icône `search`, « Rechercher », `⌘K` ou `Ctrl K` en mono 11 px dans une puce) ; groupe **Projet** (libellé 11/600 capitales +0,06 em `--muted-foreground`) : carte projet puis navigation ; groupe **Organisation** : Tous les projets (`folder_open`), Réglages (`settings`) ; **pied** : « Replier la barre » (`left_panel_close`, discret, 13 px) puis identité (avatar 32 px, nom 13/500, e-mail 12 px) et bouton de thème (`dark_mode` / `light_mode`, 36 px).
- **Carte projet** : bouton de 64 px, bordure `--border`, fond `--background`, rayon 10 ; nom 14/600, `PhaseRail size="sm"`, `unfold_more`. Menu : « Récents » (8 au plus), « Tous les projets », « Créer un projet » (propriétaire et administrateur).
- **Navigation du projet**, dans l'ordre : Vue d'ensemble (`space_dashboard`), Idée (`lightbulb`), Assistant de cadrage (`smart_toy` : `auto_awesome` n'existe pas dans le jeu d'icônes ; jusqu'au lot 5), groupe SPEC, Tickets (`view_kanban`, compteur du sprint actif en pastille `--secondary` quand il existe). Entrées de premier niveau : 36 px, 14/400, icône 20 px ; sous-entrées de la spec : 32 px, 13 px, icône 18 px, écart de 1 px. **Hauteur basse** (`@media (max-height: 900px)`) : entrées de premier niveau 32 px (36 px dans le tiroir, au lieu de 44 px), sous-entrées de la spec 28 px, carte projet 56 px, tuile d'organisation 40 px, écart de groupe 12 px, afin que Organisation et le pied tiennent sans défilement dès 800 px de haut (cible minimale WCAG 2.5.8 de 24 px respectée).
- **Entrée active** : fond `--background`, contour 1 px `--border`, texte 600, icône pleine (FILL 1) en `--primary`, `aria-current="page"`. Survol : fond `--accent`. Focus : anneau de 2 px `--ring` (`focus-visible` seulement).

**Groupe SPEC** (sept livrables, décision 21 §0) : en-tête **« SPEC »** 11/600 capitales +0,06 em `--muted-foreground`, compteur mono 12/500 « 0/7 » à droite (validés sur sept), **sans chevron** et sans repli. Sous-entrées numérotées : numéro mono 11 px `--muted-foreground`, icône, libellé. Ordre : 1 Fonctionnel (`task_alt`), 2 Données (`database`), 3 Architecture (`account_tree`), 4 Technique (`terminal`), 5 Sécurité (`shield`), 6 Design (`palette`), 7 Qualité (`fact_check`).
- **Disponible** : un vrai lien. Pas de pastille de statut tant que `spec.deliverables` n'existe pas (TK-100) ; `DeliverableStatus compact` s'y branchera.
- **Verrouillé** : une seule ligne, libellé `--muted-foreground`, icône `lock` de 14 px en `--border-strong` à droite (elle ne porte pas le sens). Élément `button` `aria-disabled="true"`, focalisable, qui ne navigue pas ; sa condition (« Disponible après les données ») est dans l'infobulle (ouverte au focus et au survol) **et** dans le nom accessible (« Données, disponible après le fonctionnel »).
- **Rail replié** : l'en-tête devient un trait de 24 px `--border` (planche 05 l.63, B169) ; les sous-entrées restent des icônes de 36 px avec `aria-label` « Spec · Fonctionnel » (ou la condition pour une entrée verrouillée).

**`ProjectHeader`** : en haut de chaque page de projet, fond `--background`, bordure basse 1 px `--border`, marges 20 / 32 / 16 px (16 px de côté sous 768 px).
- Ligne 1, 13 px `--muted-foreground` : `nav` « Emplacement » en liste ordonnée : nom du projet (lien vers `/projects/<id>`, `--foreground` 500), « / », section (« Spec »), « / », page (`aria-current="page"`). À droite, pour l'équipe : icône `commit`, SHA de 7 caractères en mono, « spec à jour il y a N min ». Sans lecture de spec (client, spec en échec) : rien, sans trou.
- Ligne 2 : h1 24/600 −0,02 em (pour un livrable, son nom : « Cahier fonctionnel ») ; pour un livrable, la pastille de validation et un résumé de 13 px (« 7 fonctionnalités ») ; à droite, actions secondaires puis **l'action principale** (règle 2). Le résumé passe sous le titre sous 768 px.
- Ligne 3 (facultative) : onglets en liens dans une `nav` nommée, 36 px, 14/500 ; actif en 600 souligné de 2 px `--primary` et `aria-current="page"` ; compteur `CountBadge` 11/600 (v2.6, I4) en pastille `--secondary` quand il est connu ; les onglets reposent sur la bordure basse. Défilement horizontal interne sous 768 px (sans défilement de la page).
- Remplace le fil d'Ariane v1 « Koklo > Projets > X > Page ». Une page d'organisation (Projets, Réglages) porte un `PageHeader` (v2.8, I29) : fil « Organisation / Réglages / section » facultatif, h1, actions, ligne `summary` facultative (13 muted, « Atelier Lumière · 3 projets · 6 membres »), sans SHA ni onglets ; marges 20 / 32 / 16 comme `ProjectHeader` (la planche 24 a 18 / 28 / 0, B169). `ProjectHeader` reçoit un emplacement `status` après le h1 et son résumé passe sur la ligne du h1 dès `md` ; les « / » du fil ont 12 px de part et d'autre.

**`CommandPalette`** (`⌘K`) : boîte de dialogue de 560 px au plus, `--raised`, bordure `--border`, rayon 12, `--shadow-floating`, centrée à 15 % de la hauteur ; champ de recherche 48 px (icône `search`, placeholder « Rechercher un projet, une fonctionnalité, un ticket »), liste de 20 résultats au plus, groupes « Pages », « Projets », « Fonctionnalités », « Tickets » (libellé 11/600 capitales) ; ligne de 44 px : type et identifiant en mono (comme `EntityChip`, sans lien) puis titre ; option active : fond `--secondary` et `aria-selected`. Pied : « ↑ ↓ pour naviguer · ↵ pour ouvrir · Échap pour fermer » en 12 px. États : chargement (`aria-busy`, lignes squelettes), vide (« Aucun résultat pour « … » » + « La recherche porte sur tout le projet, pas seulement sur ce qui est affiché. »), erreur (« La recherche a échoué. Réessayez. » + « Réessayer »), total (« 134 résultats · 20 affichés » quand le serveur en a plus). Recherche **serveur**, anti-rebond de 200 ms. Sous 768 px : largeur de l'écran moins 32 px, ancrée en haut.

**Clavier de la palette** (v2.3) : `Ctrl K` / `⌘ K` ouvre la palette partout, y compris dans un champ (la saisie du champ n'est pas touchée) ; Échap ferme et **rend le focus à l'élément qui l'avait** ; la **première option est toujours l'option active** quand les résultats changent ; les pages se filtrent **à la frappe**, le serveur est interrogé 200 ms après la dernière frappe (la requête précédente est annulée) ; « Tapez pour rechercher. » ne vaut que champ vide ; sans option (aucun résultat, erreur) la liste est masquée plutôt qu'un `listbox` vide (axe `aria-required-children`).

**Kanban à 375 px** (v2.3) : la région des colonnes garde une barre de défilement fine (`scrollbar-width: thin`, couleur `--border-strong`) et une ombre de 24 px sur chaque bord qui cache encore des colonnes (`--foreground` à 16 %, décorative, `pointer-events: none`).

**Pages « Bientôt »** : `EmptyState` (icône `schedule`, titre « Bientôt », une phrase qui dit ce qui viendra, aucune action) sous un `ProjectHeader` à la ligne 1 et au h1 du livrable ou de l'espace ; jamais de lien mort : seules les entrées disponibles y mènent.

**Réglages** (v2.4, TK-97, passation 19 §1, décisions B96 et B97) : h1 « Réglages » 24/600 dans un `PageHeader` ; sous lui, navigation secondaire de **240 px** (groupes Organisation et Vous, libellé de groupe 11/600 capitales, entrée de 36 px, active sur `--secondary` en 600 texte `--foreground` (v2.6, I18), badge du nombre de membres) et contenu à droite (h2 `text-section-title` + une phrase `--muted-foreground`). Sous 768 px la navigation devient des liens horizontaux défilants. Sections par rôle : voir `design/screens/S-settings.md` ; section interdite -> section par défaut ; bandeau `lock` de lecture seule (`InlineAlert` neutre ; `Alert` est déprécié, v2.6) ; fil d'Ariane facultatif « Organisation / Réglages / section » dans `PageHeader` (v2.6, I29) ; h2 de section **20/600** (`text-settings-title`, Réglages seulement, I19, décision de l'utilisateur) ; actif d'un contrôle segmenté sans violet (I5). Les onglets de TK-88 disparaissent. **Fournisseurs d'IA** (v2.5, TK-98) : le h2 est « Fournisseurs d'IA » ; lignes de fournisseur à `Pill sm` : Principal (`primary`), Secours (`soft`), Vérifiée (`success`, `check_circle`, B141 révisée par B171) et Intermédiaire (`warning`, `swap_horiz`), statuts toujours doublés d'une icône ; boutons de ligne `sm` (« Retirer » fantôme) dès `md`, puce « Fournisseur · modèle » en `IdTag pill`, options de modèle en `OptionChip`, secours en `Switch`, consommation en `ProgressBar`, cartes en `Card panel`, confirmations en `Toast` (v2.9, TK-141), noms de fournisseurs réservés à cet écran, montants en « ≈ € » (estimation) ; détail : `design/screens/S-ai-settings.md`.

Écartées : garder le chevron de repli du groupe Spec (périmé, B2) ; « validés sur 6 » (il y a 7 livrables) ; liste complète des projets dans la carte projet (liste longue : 8 récents + « Tous les projets ») ; recherche locale sur les éléments chargés (B3 : serveur).

### 5.5 Primitives de base (v2.6, TK-138, catalogue `docs/refonte/catalogue-composants.md` §1.1 et §1.2)

Mesures normalisées (incohérences I1 à I29 tranchées, questions B143 et B144). Galerie : `/dev/ui`, sections « Primitives » A, B et C. Tout est en jetons ; aucune taille `text-[..]`.

| Composant | Mesures et règles |
|---|---|
| Jetons | Couleur `--alert-success-*` (clair #f0fdf4 / #bbf7d0 / #14532d ; sombre #0f2a1a / #14532d / #bbf7d0), `--overlay` (rgb(13 11 28 / .38) ; sombre rgb(0 0 0 / .55)). Ombres `--shadow-dialog` (0 18px 44px .20), `--shadow-sheet` (-16px 0 40px .22, gardée en sombre), `--shadow-toast` (0 8px 24px .25), none en sombre sauf toast et tiroir. Rayons `--radius-card` 10 et `--radius-dialog` 14. Texte : `text-card-title` 15/600, `text-dialog-title` 18/600, `text-stat` 24/600 -0,02 em, `text-count` 11/600, `text-code-sm` mono 11/500, `text-settings-title` 20/600 (Réglages seulement). |
| `Button` | Tailles du §5.2. Variantes `default`, `secondary`, `outline`, `ghost`, `destructive`, `dashed` (bordure pointillée `--border-strong`, transparent), `inherit` (contour `currentColor`, texte hérité, 600), `link` (souligné 600, 28), `text` (lien texte 26, 13/500, marges 8, `--text`, souligné ; v2.10). Props `icon`, `shortcut` (`Kbd` en suffixe), `loading` (`Spinner`, `aria-busy`, .82), `pressed` (halo `0 0 0 3px --secondary`), `fullWidth`. `size="icon"` reste un alias de 36 × 36. |
| `IconButton` | Carré `sm` 32 (icône 18, rayon 6) ou `default` 36 (icône 20) ; variante `primary` 32 rayon 8 (envoi). `aria-label` imposé par le type. |
| `Kbd` | Mono 11/500 (`text-code-sm`), hauteur 18, marges 0 5, bordure `--border`, rayon 4, fond `--background`. |
| `Spinner` | `progress_activity` 16, 18 ou 20, `--primary` ou `currentColor`, rotation sous `motion-safe:animate-spin`, `aria-hidden`. |
| `Pill` | Tailles `xs` 18 (11/600, 0 6), `sm` 22 (11/600, 0 8, écart 4, icône 14), `md` 24 (12/500, 0 10 ; 0 10 0 6 avec icône 16, écart 6). Tons `neutral`, `soft`, `outline`, `dashed`, `primary`, `success`, `warning`, `danger`, `muted`. `icon` pleine. `interactive` : bouton avec `keyboard_arrow_down` 16. `Badge` reste exporté (alias de `Pill`). |
| `CountBadge`, `Dot` | `CountBadge` : `Pill xs`, marges 1 7, 11/600, tons `soft`, `primary`, `success`, `warning`, `outline`. `Dot` : 7 × 7 rond `--primary`, `aria-label` obligatoire. |
| `RolePill` | `Pill md` : propriétaire et administrateur `soft`, développeur, designer et business `outline`, client `warning`. `tone` facultatif (v2.10, TK-141 : l'en-tête de Réglages est plein, `warning` pour le client, planche 24 l.336) ; `icon` facultatif (TK-141) : `badge` dans l'en-tête de Réglages, `person` pour le client ; l'icône `group` (Membres) s'ajoute au registre. |
| `IdTag` | Mono 12/500, hauteur 22, 0 6, rayon 6 ; `tone` `soft` ou `outline` ; `size` `sm` 20 mono 11 ; variante `pill` « Fournisseur · modèle » (30, rond, bordure `--border`, `--surface`). |
| Statuts | `STATUS_PILL` = `Pill md` : 24 px, `0 10 0 6`, écart 6 (`LifecycleStatus` : `0 10 0 8`, écart 8). Valable pour `ValidationStatus`, `DeliverableStatus`, `LifecycleStatus`. |
| `Avatar`, `IconTile` | `Avatar` 24, 28, 32, 36 (défaut), 40 ; tons `soft`, `warning` (client), `agent` (`--primary`), `muted` ; forme `circle` ou `tile` (rayon 6, 8, 10, 14 selon la taille) ; initiales 10/600 en 24 (cartes de projet), 12/700 jusqu'à 32, 14/700 au-delà. `IconTile` 28 / 32 / 36 / 40 / 48, rayon 8 / 8 / 10 / 10 / 12, icône 18 / 18 / 20 / 20 / 28 ; tons `soft`, `primary`, `success`, `warning`. |
| `FilterChip`, `OptionChip` | Pilule 28, 0 12, 12/500, `aria-pressed`. Actif : bordure `--primary`, fond `--secondary`, texte `--secondary-foreground`. Inactif : `--border`, `--background`, `--foreground` (planche 08 l.223). Compteur facultatif. Variante `add` pointillée : 30 px, texte `--foreground` 500 (maquette 10 l.184). `OptionChip` : 32, `role="option"`, sélection bordure 2 `--primary` + `--secondary`. |
| `SegmentedControl` | 2 à 4 segments, conteneur `--surface` bordure `--border` rayon 8 marge 3 écart 2 ; segment 26 (`xs` 24), 12/500, rayon 6 ; **actif : `--background` + anneau 1 `--border`, texte `--foreground`, sans violet ni ombre** (I5) ; inactif transparent, muted. `aria-pressed` ou `radiogroup`. |
| `Switch`, `SwitchRow` | Radix `role="switch"`, 38 × 22, marge 3, rond 16 blanc (jeton `--switch-thumb`, identique clair et sombre) ; allumé `--primary`, éteint `--border-strong`, désactivé .6 ; ligne ≥ 44 au tactile. |
| `Checkbox` | Radix, case 20 (`check_box` plein `--primary`, `check_box_outline_blank` muted), cible 28. |
| `RadioGroup`, `RadioCard` | Radio 18, bordure 2 (`--primary` si choisi, sinon `--border-strong`), point 8. Carte rayon 10, marges 12, **bouton radio 18 visible** (marge haute 1, écart 10), titre 14/600, description 12 muted ; choisie : bordure 1 `--primary` + fond `--diff-bg`, sans anneau en plus (maquettes 21 l.131 et 10 l.398-406 ; la maquette l'emporte sur I26, B323) ; le point plein reste le repère non coloré. |
| `Input`, `SearchField`, `Textarea` | `Input` 40 (36 en `sm`), rayon 8, bordure `--border`, fond `--background`, 14, marges 0 12 ; `mono` ; invalide : bordure `--destructive` ; **désactivé : pointillé `--border-strong`, fond `--surface`, texte muted, sans `opacity-50`**. `SearchField` : `search` 18 en tête, libellé `sr-only`. `Textarea` : marges 10 12, interligne 1,5. |
| `Field`, `Select` | `Field` : libellé 13/600, écart 6, `required` (astérisque `--primary`, « obligatoire »), `optional` (« (facultatif) » 400 muted), aide 12 muted, erreur `role="alert"` 12/500 avec `error` 16. `Select` : déclencheur 40 (36 en `sm`), `keyboard_arrow_down` 18. |

### 5.6 Surfaces et retours d'état (v2.7, TK-139, catalogue §1.3 et §1.4, B152 à B157)

Galerie : `/dev/ui`, sections « Surfaces » (lot A), « Superpositions » (lot B) et « Onglets et tableaux » (lot C). Radix Toast, Dialog, AlertDialog et Tabs viennent de `radix-ui` 1.8.1 (aucune dépendance, pas de Sonner). Tout est en jetons.

| Composant | Mesures et règles |
|---|---|
| `Card` | `variant` : `panel` (défaut : rayon 12, bordure `--border`, `--background`, marges 16 / 18), `inset` (rayon 10 `--radius-card`, marges 12 / 14, `--surface`), `interactive` (lien ou bouton entier, focus visible, sélection bordure `--primary`), `proposal` (bordure pointillée `--primary`, `--diff-bg`), `dashed` (bordure pointillée `--border-strong`), `warning` (bordure `--alert-warning-border`). Titre `text-card-title` 15/600, description 13 muted, action à droite. |
| `StatCard` | `Card panel` : libellé 13 muted avec icône 18, valeur `text-stat`, jauge `ProgressBar` facultative, note 12 muted. Grille d'appel `auto-fit minmax(200px,1fr)`, écart 16. |
| `ProgressBar` | Piste `--border-strong`, `md` 6 (rayon 3) ou `lg` 8 (rayon 4), remplissage `--primary`, `role="progressbar"`, `aria-valuenow` / `min` / `max`, nom accessible obligatoire. Valeur en texte à côté (jamais seule en couleur). Variante `split` (v2.15, relecture) : second segment `--muted-foreground` à 50 %, 6 de haut. Teinte `success` (v2.19) : remplissage `--status-validated-fg` ; `pending` : part en cours à la suite, même teinte à 50 %, qui pulse (`motion-safe`). Pendant « Enregistrer N dans la spec », la barre du bandeau de relecture passe en `success` (écrites, puis lot en cours), doublée du texte « Enregistrement · lot 2 sur 3 · 200 sur 512 » ; « Quitter la relecture » est inactif jusqu'à la fin. |
| `InlineAlert` | Rayon 10, écart 10, icône 18. Tons `neutral`, `warning`, `error`, `success` (`--alert-success-*`), `readonly` (bandeau « Lecture seule » : tons neutres, icône 20 muette, marges 12 14, TK-109), `revise` et `validated` (confirmations de décision du client : fond plein `--status-revise-*` / `--status-validated-*`, sans bordure, texte 14 px, icône pleine ; `role=status`, TK-104), `agent` (`--diff-bg`, bordure pointillée `--primary`). Actions : lien souligné (28) ou un à deux `Button sm` (`inherit` dans un ton coloré). `Alert` est déprécié : on migre vers `InlineAlert neutral`. |
| `EmptyState` | Écart 10. Variantes `framed` (défaut) et `inline` (sans cadre ni tuile, icône 28 `--muted-foreground`, dans une liste). Une action principale plus au plus une secondaire (I20). |
| `Skeleton`, `SkeletonRow` | Bloc `motion-safe:animate-pulse`. `SkeletonRow` : hauteur 52, pavé 48 × 18 `--secondary` puis barre de 14 à 60, 45, 70 ou 52 %, `aria-hidden`. |
| `Toast` | Radix Toast, en bas au centre (`bottom` 24), marges 10 / 14, rayon 10, fond `--foreground`, texte `--background`, `--shadow-toast`, icône `check_circle` 18 (`error` pour l'erreur), action « OK » ou « Annuler » soulignée 13/600 (24 de haut, marges 6). Largeur au contenu, jamais étirée (planche 22). Région annoncée : polite (succès, information), assertive (erreur). Durée 5 s (8 s en erreur), suspendue au survol et au focus. Fermeture au clavier. Mouvement réduit respecté. |
| `Dialog`, `AlertDialog` | Centré, 520 au plus (`calc(100% - 32px)`), rayon 14 `--radius-dialog`, `--raised`, bordure `--border`, `--shadow-dialog`, voile `--overlay` + flou 6 sous `motion-safe`. En-tête : `IconTile 36 primary` facultative, titre `text-dialog-title`, description 13 muted, fermer `IconButton sm`. Corps marges 20 sans marge haute (en-tête 18 / 14), écart 16. Pied `--surface`, bordure haute, boutons en ligne et à droite à toute largeur (planches 08 et 22, pas d'empilement à 375 px), Annuler (`outline`) puis action principale 36. Focus piégé puis rendu, Échap ferme. `AlertDialog` : `role="alertdialog"`, focus initial sur Annuler, le voile ne ferme pas. |
| `Sheet` | `size` : `detail` 440 (défaut), `form` 540, `wide` 620 ; plein écran sous 640. Voile `--overlay`, `--shadow-sheet`. `SheetHeader` : `IconTile 36 soft`, titre `text-dialog-title`, sous-titre 12, `IdTag`, fermer 32. Corps défilant 16 / 20. `SheetFooter` `--surface`, bordure haute, boutons en ligne à droite. |
| `Tabs` | `variant="segmented"` (existant) ou `underline` : hauteur 36, écart 20, 14/500, actif 600 et trait de 2 `--primary`, icône 16 et `CountBadge` facultatifs, défilement horizontal sous 768. Mode lien (`nav`, `aria-current="page"`, ex-`HeaderTabs`) ou `tablist` (onglets d'état). `size="sm"` 13 px dans un tiroir. |
| `Table` | `framed` : cadre `--border`, rayon 12, `overflow:auto`. En-tête `--surface`, `text-caption` 12/500 muted, marges 10 / 16, collant si `stickyHeader`. Lignes séparées en haut. `dense` 12 px ; `compact` (fiche d'une table, maquette 11 l.214) : 12 px, cellules 6 × 10, cadre de rayon 10. `th scope="row"`, légende `sr-only`. `YesNoCell` : `check` `--status-validated-fg`, `remove` `--border-strong`, centrée, `aria-label` « Oui » / « Non ». |

### 5.7 Listes et navigation (v2.8, TK-140, catalogue §1.4, I15, I18, I21, I22, I28, I29, B160 à B166)

Galerie : `/dev/ui`, sections « Listes · A » (listes longues, id `dev-ui-lists`), « Listes · B » (id `dev-ui-lists-b`) et « Navigation · C » (id `dev-ui-nav`). Planches : 12 (listes), 05 (coquille), 10 et 24 (lignes, navigation des Réglages). Aucune dépendance, icônes Material Symbols, jetons seulement.

| Composant | Mesures et règles |
|---|---|
| `Pagination` | Voir §5.3. Boutons 32 bordés, numéros en mono 13, « Lignes par page » en `SegmentedControl xs`, désactivés sans `disabledReason`. |
| `VirtualList` | `framed` (rayon 12, bordure `--border`, `overflow:hidden`) ; `loadingRows={n}` : `n` `SkeletonRow` sous les lignes, `aria-hidden`. |
| `CountBar` | Total et nom en gras ; `query` : « 0 résultat pour « … » » ; tri puis `swap_vert` ; `showAllLoaded` : « · toutes chargées » quand tout est chargé (règles, rôles, parcours, sans tri). |
| `ListFooter` | Une ligne dans le cadre (variante `framed` : cadre bordé, rayon 10, 12 px, icône 16, pour les cartes de règles, rôles et parcours ; « suivants » / « suivantes » selon le genre du nom), icône 18, `Spinner` `--primary` en chargement, erreur à texte muted et icône rouge, bouton `xs`. |
| `GroupSection` | `stacked`, `actionIcon`, action visible replié, rangée « Afficher N de plus » pleine largeur `--primary`. |
| `ListPanel` | Cadre rayon 12, `--border`, `overflow:hidden`, `--background`. En-tête facultatif : h2 16/600 et lien « Tout voir » `--primary` 13/500 avec `arrow_forward` 16. Pied facultatif `--surface`, 12 `--muted-foreground`, bordure haute. Liste `ul` nommée. |
| `ListRow` | `li` (ou, avec `as="div"`, contenu de ligne sans bordure ni marge pour un hôte qui pose son `li`, comme `VirtualList`) séparé du précédent par une bordure haute `--border`. Marges 12 / 16 (ou `fixedHeight` : 52). Tête : icône d'état 18 à 20, `IdTag` ou case à cocher. Titre 14/500 tronqué, sous-titre 12 `--muted-foreground`. Queue : pastille, valeur mono 12 ou actions `Button sm`. `selected` : fond `--secondary`, `aria-current="true"`. Ligne entière cliquable (lien ou bouton) avec focus visible `--ring`. |
| `ProjectHeader` | Emplacement `status` (h1, puis `status`, puis résumé 13 muted, tous sur une ligne à partir de `md` ; prop `summaryOwnLine` : le résumé a sa propre ligne sous le titre, à toute largeur, comme à l'écran Fonctionnel, maquette 10 l.77) ; « / » à 12 de part et d'autre. |
| `PageHeader` | Page d'organisation : fil facultatif (13 muted, dernier segment `aria-current="page"`, premier en 500 `--foreground`), h1 24/600, `status` et actions facultatifs. Marges et bordure basse de `ProjectHeader`, sans SHA ni onglets. |
| `PhaseRail size="inline"` | Texte 12 `--muted-foreground`, sans cadre ni marge, traits 12 × 4 (rayon 2, écart 3) ; libellé « Cadrage · 2 sur 4 » ; `sm` encadré garde 14 (I15). |
| `ShellNavGroup` | Libellé 11/600 capitales +0,06 em `--muted-foreground` ; `separator` : trait haut `--border` et 12 de marge ; dans le rail le libellé devient un trait de 24 `--border`. |
| `ShellNavItem` | Prop `count` : `CountBadge` 11/600, masqué dans le rail (le nom accessible du rail l'ajoute : « Tickets, 12 »). `badge` reste accepté. Libellé du bouton de rail « Déplier la barre » (I28). |
| `SecondaryNav`, `NavItem` | 240 de large dès `md` (bordure droite), groupes 11/600 capitales, entrée de 36, 14, icône 18 (pleine `--primary` quand courante), active `--secondary` 600 texte `--foreground` (I18), `CountBadge outline` facultatif ; sous `md` liens horizontaux défilants sans libellés de groupe visibles (cibles de 44). |

### 5.8 Espace Idée (v2.10, TK-89, passation 02, maquette 06)

| Composant | Règle |
|---|---|
| `ReorderableList`, `PageStatus`, `StatusLegend` | `nav` de 264 (marges de l'encadré selon passation 12 §8.3), `ol`, ligne de 34, poignée `drag_indicator` 24 × 28 `--border-strong` (24 : cible minimale WCAG 2.5.8 ; la maquette dit 20), menu `more_horiz` de la ligne visible au survol et au focus seulement dès 1024 px, étiquette « requise » 10/600 bordure `--border` rayon 4, ajout en `Button dashed`. Légende : encadré `--surface`, 12/400, icônes `currentColor` (stable pleine). Menu sous 1024 px : état, titre, « requise » et marque de la page courante par entrée. Statuts : stable `check_circle` plein `success`, à relire `rate_review` `--primary`, brouillon `edit` muted, vide `radio_button_unchecked` `--border-strong`. `@dnd-kit/sortable` (ADR 0020), Alt + flèches, annonces. |
| `Prose`, `TaskItem`, `TaskCheckbox` | Colonne de 680 (blocs espacés de 18 dans le contenu de l'éditeur aussi, interligne des listes 1,5, h2 en 1,2), chemin mono 12, h2 28/600 -0,02 em, h3 18/600, paragraphe 15/1,65, tâches `check_box` 20. L'éditeur TipTap (ADR 0019) vit dans `apps/web`, avec une tâche modifiable `TaskCheckbox` (même icône que `TaskItem`) : case de 20 dans une cible de 24, `role="checkbox"`, nom accessible = texte de la tâche. |
| `AvatarGroup` | `Avatar` 28 chevauchés de -8 (24 chevauchés de -6), bordure 2 `--background`, ton `warning` pour le client, `soft` pour les autres personnes. |
| `AppShell defaultCollapsed` | Rail de 64 par défaut sur l'espace Idée, la valeur mémorisée reste prioritaire. |
| `PageNavItem`, `PageStatus pill`, `ProseInvite`, `ProsePath`, `ProjectHeader meta` | Ligne de page (34, icône d'état, titre numéroté, « requise », nom accessible tiré du contenu (icône d'état, titre numéroté, « requise »)), pastille `soft` d'état du document, invite « Écrire, ou taper « / » », chemin mono 12, information à droite de l'emplacement (état d'enregistrement). Jetons `--text-prose-title-size` 28, `--text-prose-heading-size` 18, `--text-prose-body-size` 15 (interligne 1,65). |

Galerie : `/dev/ui`, section « 12. Espace Idée » (id `dev-ui-idea`). Sous 1024 px l'arborescence devient un menu déroulant (pas de glisser tactile).

### 5.9 Agent de l'espace Idée (v2.11, TK-90, passation 02, maquette 06)

| Composant | Règle |
|---|---|
| `AgentPanel` | `aside` nommé « Agent », 360 à 380 de large, `--surface`, bordure gauche ; en-tête `IconTile` 28 `soft` `wand_stars`, titre 600, `SegmentedControl` « Mode de l'agent » (Entretien / Libre, `aria-pressed`, absent si l'agent n'est pas configuré) ; fil défilant, pied pour la saisie. |
| `ChatBubble` | Agent : rayon 4 12 12 12, `--background`, bordure ; humain : 12 4 12 12, `--secondary`, texte `--foreground`, aligné à droite ; marges 10 12, retrait de 24 du côté opposé ; auteur 12/400 muted au-dessus ; lien de contexte en dessous. Le texte reste littéral (jamais de lien actif ni de balise). |
| `AgentComposer` | Cadre rayon 10 qui porte le focus (anneau), textarea de 2 lignes sans bordure, `Envoyer` 32 `--primary` (`arrow_upward`), Entrée envoie, Maj+Entrée saute une ligne ; pendant le flux `Arrêter` remplace `Envoyer`. |
| `ProposalDiff` | Cadre pointillé 1 `--primary`, rayon 12, fond `--diff-bg` ; barre haute `wand_stars` + « Proposition de l'agent · ajout d'une section / remplacement / ajout » + justification ; remplacement : ancien texte barré (« Texte remplacé » pour les lecteurs d'écran) ; pied Accepter `A`, Modifier, Rejeter `R` (raccourcis actifs seulement avec le focus dans le cadre et hors champ de saisie, 2.1.4) ; « Proposition 1 sur 3 » avec précédente/suivante ; périmée : barrée, « Le texte a changé depuis cette proposition. », « Redemander à l'agent », plus d'Accepter. |
| `DecisionNotice` | `role=status`, icône `history` 16, 13 muted, « Annuler » pendant les 10 s. |
| `ProposedPageCard`, `ProposedPageList` | Dans l'arborescence : cadre pointillé rayon 8 `--diff-bg`, titre 600, justification 12, « Ajouter la page » et « Ignorer » de 28 ; la liste montre 3 cartes puis « N autres ». Pastille 7 `--primary` sur la page qui a des propositions en attente. |
| `AgentPrivacyNote` | Sous la saisie : ligne nue `role="note"` (sans cadre), `lock` 16, texte 12/400 `--muted-foreground`, « Détails » de 22 de haut 12/600 souligné qui déplie la liste (`aria-expanded`). |
| `AgentGapsCard` | « Ce qui manque encore », 4 lignes au plus, page en mono 12, « Explorer » (page existante) ou « Proposer une page » ; rien si la liste est vide. |

Galerie : `/dev/ui`, section « 13. Agent de l'espace Idée » (id `dev-ui-agent`). Mention du fournisseur : jamais son nom (« Envoyé au fournisseur d'IA de l'organisation, avec sa clé », B228). Sous 1024 px le panneau passe sous le document. Dès 1024 px il occupe la hauteur sous l'en-tête (l'espace Idée fait la hauteur de la fenêtre ; arborescence, document et fil défilent chacun, saisie ancrée en bas). `Textarea mono` : texte de la proposition à modifier. Le texte d'une proposition se rend dans `Prose`. Justification, auteur et indication de mode : 12/400.

### 5.10 Maturité, Synthèse et passage au cadrage (v2.12, TK-91, passation 02 §9, décision 05 §2 « Lot 2 », maquette 06 l.43-64 et l.74)

| Composant | Règle |
|---|---|
| `MaturityMeter` | `role="meter"` nommé « Maturité du dossier », `aria-valuemin` 0, `aria-valuemax` = pages hors corbeille, `aria-valuenow` = pages stables. Crans de 10 × 6 (rayon 2, écart 3) : atteints `--primary`, restants `--border-strong` ; les crans passent à la ligne au-delà de la largeur disponible. Le texte « N pages stables sur M » (13 `--muted-foreground`, « 1 page stable » au singulier) l'accompagne : la jauge n'est jamais seule, ni la couleur. |
| `SynthesisNavItem` | Première ligne de l'arborescence, au-dessus de la liste numérotée, hors `ReorderableList` : 34 de haut, bordure `--border`, rayon 6, fond `--background`, icône `wand_stars` 18 `--primary` (`auto_awesome` absente du jeu, B230), libellé « Synthèse », étiquette « générée » (même gabarit que `RequiredTag`). Page courante : `--secondary` 600, `aria-current="page"`. Ni poignée, ni menu, ni statut, ni pastille. |
| `Button` « Passer au cadrage » | Principal (`--primary`) avec `arrow_forward` à droite quand le seuil est atteint ; sinon `disabled` en pointillé (style natif de `Button`), relié par `aria-describedby` à la raison « Pour passer au cadrage, il manque : Périmètre stable » (`info` 16, 12 `--muted-foreground`, visible, jamais une infobulle seule). Absent pour le client et le business. |
| `InlineAlert` « Modifié depuis idea-v1 » | Sous l'en-tête, `info` neutre, bouton « Figer une nouvelle version » (équipe seulement) ; le client lit seulement l'information. |

Page Synthèse : lecture seule, `Prose` (colonne de 680), chemin mono « idea/_synthese.md », pastille « générée » et ligne « Générée depuis idea-v1 · <date> » ; « Régénérer » (équipe, `Button outline`). Avant la première version : `EmptyState` « La synthèse sera générée quand vous passerez au cadrage. » et, pour l'équipe, « Générer un aperçu ». Un aperçu porte la mention « Aperçu, non publié ». Galerie : `/dev/ui`, section « 12. Espace Idée » (ajouts : `MaturityMeter`, `SynthesisNavItem`).

### 5.11 Vue d'ensemble du projet (v2.13, TK-92, passation 03, décision 05 §2 « Lot 3 », 21 §0, maquette 07 l.66-195)

| Composant | Règle |
|---|---|
| `SegmentedGauge` | Crans `flex-1` de hauteur 6 (cartes d'indicateur, l.118) ou 5 (cartes de livrable, l.140), rayon 2, écart 3, 12 au plus ; atteints `--primary` (ou `--status-validated-foreground` pour un livrable validé), restants `--border-strong` ; `aria-hidden`, la valeur est écrite à côté. `MaturityMeter` (§5.10, crans de 10 × 6) en est une variante. |
| `NextStep` | Carte « Prochaine étape » (l.103-111) : `section` nommée, rayon 12, marges 16 18, tuile d'icône 40 (rayon 10), surtitre 12/600 capitales « PROCHAINE ÉTAPE », titre 15/600, phrase 13, bouton contour 36 à droite (sous 768 px : pleine largeur sous le texte, 44). Ton `warning` (`--alert-warning-*`, identiques à la planche en clair et en sombre) ; ton `neutral` (`--alert-neutral-*`) pour « Rien n'attend d'action. », sans bouton. `role="note"`. Action : lien ou bouton selon `kind`. |
| `DeliverableCard` | `Card interactive` (l.133-145) : tuile 32 `--secondary`, nom 14/600 (`text-subsection-title`), `DeliverableStatus` à droite, contenu 13 muted, `SegmentedGauge` 5, avancement 12/400 muted à gauche, valideur à droite (`person` 600 `--foreground` pour « Validation client · obligatoire », `groups` muted sinon). Un seul lien par carte, `aria-label` complet. Variante `soon` : non interactive, statut « À faire », « Bientôt disponible », sans jauge. Sans `href` (rôle qui ne peut pas ouvrir l'écran, ex. client) : carte non interactive, jauge conservée. |
| `DeliverableStatus` `revise` | « À revoir » : icône `edit_note`, ton `--status-revise-*` (même gabarit que les autres statuts). Prime sur « À valider ». |
| `ActivityFeed`, `PersonRow` | Liste d'écart 14 ; ligne : `Avatar` 32 (ton `warning` client, `agent` « IA », `soft` équipe), texte 13, date relative 12 muted (l.172-179). `PersonRow` : `Avatar` 32, nom 13/500, rôle 12 muted (l.185-188). |
| `PageStatus pill="status"` | Pastille d'état d'une page de l'Idée dans la liste du bloc principal (l.161) : « Stable » en ton `success` (icône pleine), les autres en `soft` (icône au contour), marges 0 10 0 6, icône et libellé. |
| `TicketStatus` | `Pill md` (icône pleine, au contour en ton `neutral` comme `DeliverableStatus` : prop `iconFill` de `Pill`) : En revue (`warning`, `rate_review`), En cours (`neutral`, `smart_toy` si agent sinon `edit`), Terminé (`success`, `check_circle`), À faire (`neutral`, `radio_button_unchecked`) ; l.161. |
| Variantes de la planche 07 | `StatCard density="comfortable"` (marges 16 / 18, écart 8, valeur 26/1,1, note 13, l.115-120) ; `ListPanel density="comfortable"` (en-tête 14 20 avec ligne, lignes 12 20 écart 14, pied 10 20, titres et sous-titres qui passent à la ligne, l.151-166) ; `IconTile fill={false}` (tuile de livrable au contour, l.136) ; `Button size="compact"` (30 de haut, marges 10, 13/500, l.180) ; initiales d'`ActivityFeed` et `PersonRow` en 11/600. |
| Assemblage | Fil : `PhaseRail` grand dans une carte rayon 12, marges 20 24 (l.88-101). Indicateurs : grille `auto-fit minmax(200px,1fr)` écart 16, `StatCard` (`segments`, jauge à crans décorative) (l.113-122). Bloc principal : `ListPanel` (Idée, Itérations : `IdTag`, titre, ligne secondaire, statut ; pied « Les 5 éléments les plus urgents… », l.151-166) ou grille `auto-fit minmax(260px,1fr)` écart 12 des sept `DeliverableCard` (l.126-148). Colonne de droite 320 à 420 : Activité (bouton « Voir toute l'activité · N ») puis Personnes, cartes marges 16 20 (l.169-191). En-tête : `ProjectHeader`, résumé « Client : … · démarré le … », « Inviter » secondaire (équipe), action principale selon la phase (l.67-84). |

La barre latérale de la planche 07 (l.30-64) est périmée : on suit la décision 05 et la coquille de TK-88 (§5.4). Les sept livrables suivent l'ordre de la décision 21 (Sécurité 5e). Galerie : `/dev/ui`, section « 14. Vue d'ensemble » (ajouts ci-dessus). Fiche : `design/screens/S-overview.md`.

### 5.12 Liste des projets et création (v2.14, TK-93, passation 04, B297 à B308, maquette 08 l.55-166)

| Composant | Règle |
|---|---|
| Teintes `--hue-1..5-bg` / `--hue-1..5-fg` | Cinq paires douces (indigo, cyan, vert, ambre, rose), l.196-199 de la maquette : clair `#eeeaff/#43299f`, `#e0f5fa/#0e5566`, `#e3f7ea/#1d5e33`, `#fef3c7/#7a3b0a`, `#fbe7f1/#7d2252` ; sombre `#231d4a/#cbc1ff`, `#0f2f3a/#a5e4f3`, `#14301f/#b4ebc6`, `#3a2a0c/#fde68a`, `#3b1a2e/#f5c2dd`. Contrastes AA vérifiés par `contrast.test.ts`. La teinte est choisie par `colorKey` (1 à 5, serveur). |
| `ProjectTile` | Tuile aux initiales (`tone="soft"` : `--secondary` au lieu de la teinte, carte de création l.87), 22 (barre, rayon 6, 10/700), 36 (carte de création, rayon 10) ou 40 (carte, rayon 10, 14/700), teinte `--hue-n`, `aria-hidden`. |
| `PhasePill` | Pastille contour (`Pill`, hauteur 24, 0 10, 12/500, bordure `--border`) : 4 traits 10 × 4 rayon 2 (faits `--primary`, courant `--primary` à 45 %, restants `--border-strong`) + « Cadrage · 2/4 » (l.107-109). Un trait à 10 px est la valeur de la planche 08 (I15 la ramenait à 12 : la planche fait foi ici). |
| `ProjectCard` | `a` entier (l.97-119) : bordure `--border`, rayon 14, marges 18, écart 14, fond `--background`, survol `--border-strong` ; tuile 40, nom 16/600, client 13 muted, `PhasePill` ; avancement 13 (libellé muted, valeur 600) + `SegmentedGauge` 6 (10 crans au plus) ; encart de prochaine étape 13 (rayon 8, marges 8 10, icône 16) : ton `warning` (`schedule`, `--alert-warning-*`) ou `neutral` (`arrow_forward`, `--surface`) ; pied 12 muted : `AvatarGroup` 24 (client en ton `warning` en premier) + « acteur, date relative » en forme courte (« il y a 20 min », « il y a 2 h », « hier », « il y a 3 j »). Pas d'`aria-label` : le nom accessible vient du contenu visible (WCAG 2.5.3, axe `label-content-name-mismatch`). |
| `ProjectCard creating` | Cadre pointillé `--primary`, fond `--diff-bg`, `role="status"`, marges 18, écart 12 (l.85-96) : tuile 36, nom 16/600, `ProgressChecklist`, phrase 12 muted, bouton « Ouvrir le projet » (`Button sm`, `arrow_forward`). Échec : l'étape passe en `error` (icône `error`, texte `--destructive`) avec sa phrase et son action (S-projects v7 §4.2). |
| `ProgressChecklist` | Lignes 13 (écart 8) : `check_circle` plein 18 en `--status-validated-foreground`, étape en cours `Spinner` 18 `--primary` (animation sous `motion-safe:`), à venir `radio_button_unchecked`, échec `error` ; libellé muted tant que l'étape n'est pas faite ; `role="status"`, chaque changement annoncé une fois. |
| Assemblage | En-tête `ProjectHeader` d'organisation (l.56-64, h1 24/600) ; barre d'outils (l.67-82) : `SearchField` 36 (max 320), `FilterChip` 32 en `role="group"` nommé « Filtrer par phase » (`aria-pressed`, compteur 12 à 75 %), « Trié par : activité récente » à droite (menu de tri ; trois choix) ; grille `repeat(auto-fill, minmax(320px, 1fr))` écart 16 ; pied `ListFooter` ; boîte `Dialog` 520 (l.124-164) : titre 18/600, bouton « Fermer », phrase 13 muted, `RadioCard` pour la structure, compte GitHub en `Select` 40 seulement s'il y en a plusieurs, `Switch` « Les données de ce projet restent dans l'UE » (owner et admin). |

Barre : groupe « Récents » (3 projets, `ProjectTile` 22, l.38-41) au-dessus d'« Organisation » quand aucun projet n'est actif. Il s'écrit avec `ShellNavItem leading` (la tuile prend la place de l'icône) ; `SegmentedGauge max` (10 sur les cartes, 12 par défaut) et `AvatarGroup size` (24 sur les cartes, 28 par défaut) servent la carte. Les teintes vivent dans `packages/ui/src/styles/hues.css`, exposées en `bg-hue-n` / `text-hue-n-foreground`. Galerie : `/dev/ui`, section « 15. Projets » (`ProjectTile`, `PhasePill`, `ProgressChecklist`, `ProjectCard` : normale, attention, client, création, échec). Fiche : `design/screens/S-projects.md` v7.

### 5.13 Propositions de l'agent (v2.15, correction 1, TK-99b, passations 14 et 07 §1.4, B319, maquettes 21, 10 l.92-169 et 388-419, 12 l.126-148)

| Composant | Règle |
|---|---|
| `AgentProposeButton` | Hauteur 36, marges 0 14 0 12, rayon 6, 14/500, icône `wand_stars` 20 (l'`auto_awesome` des planches, §4). `idle` `--primary` ; `open` + halo 3 `--soft` ; `running` `progress_activity` (animation sous `motion-safe:`), « L'agent propose… », opacité .82, curseur `progress`, `aria-disabled` ; `ready` `rate_review`, « Relire N propositions », halo ; `unavailable` bordure pointillée `--border-strong`, fond `--surface`, texte `--muted-foreground`, infobulle avec la raison. Premier des actions de l'en-tête, absent en vue client. Maquette 21 l.110-118. |
| `AgentProposePopover` | Modale `Dialog` centrée, 520 (`calc(100% - 32px)`), rayon 14, ombre `0 18px 44px rgba(20,16,43,.20)`, voile `--overlay` flou 6 sous `motion-safe`. En-tête `IconTile` 34 `--primary` + titre 15/600 + sous-titre 12 ; cartes radio (`role="radio"`, pastille 18, point 8, rayon 10, choisie : bordure `--primary` et fond `--diff-bg`), `Pill xs primary` « Recommandé », `Pill xs soft` pour le compte ; `Textarea` 2 lignes (`value`) ; puces « L'agent lit » 22 ; pied `--surface`. Maquette 21 l.57-68, 127-131 ; 10 l.388-419. |
| `ProposalGenerationBanner` | Bande de génération pleine largeur (maquette 10 l.107-108) : `--diff-bg`, bordure basse, `progress_activity` 18 `--primary`, texte 13 (« … Cela peut prendre une minute. Vous pouvez quitter la page. »), « Annuler l'attente » souligné ; `role="status"`. Suivie de `ProposalSkeleton` (6 lignes de 44). |
| `ProposalReview` | Bandeau `--diff-bg` (`role="group"` nommé ; les annonces passent par une région `role="status"` à part) : « Mode relecture · N propositions · A acceptées · R rejetées · P à relire », barre 6 (acceptées `--primary`, rejetées `--muted` à 50 %), « Enregistrer A dans la spec ». Liste 330, détail, pied Accepter `A` · Modifier · Rejeter `R` · demande à l'agent ; « Remettre à relire » une fois décidée. Raccourcis J / K / A / R hors champ de saisie (2.1.4). Maquette 10 l.114-168. |
| Relecture en volume | Filtre « À relire » par défaut ; au-delà de 30, groupes repliables à en-tête collant (`aria-expanded`), 8 éléments puis « Afficher 20 de plus · N restantes dans ce groupe », « Accepter les N restantes » par groupe seulement, liste du groupe ouvert virtualisée (`aria-setsize`, `aria-posinset`). Maquette 12 l.126-148. |

Galerie : `/dev/ui`, section « 14. Propositions de l'agent » (id `dev-ui-proposals`). Texte du modèle toujours brut (jamais de lien ni de balise) ; jamais le nom du fournisseur d'IA (la note dit « l'agent IA avec la clé de l'organisation »).

### 5.14 Panneau d'édition `SpecItemSheet` (v2.16, TK-101, passation 11, B329, maquette 16 l.58-108 et 196-229)

| Composant | Règle |
|---|---|
| `SpecItemSheet` | `Sheet` latéral droit `size="form"` : 540 (`md:max-w-[540px]`), **plein écran sous 768** (la passation 11 l'emporte sur le 640 du `Sheet` de base), `role="dialog"`, `aria-modal`, `h2` relié par `aria-labelledby`, fond `--background`, bordure gauche, ombre `-16px 0 40px rgba(20,16,43,.22)`, voile `--overlay`. En-tête sur une ligne : `IconTile` 36 `soft`, titre 18/600 (interligne 1,3), sous-titre 12 `--muted-foreground`, `IdTag` mono à droite, fermer 32 (icône 20), sans rayon (B332). Corps défilant (région `tabIndex=0`), marges 16 20, espacement 16. Pied `--surface` : ligne de fichier mono 12 (`description` 16) + « un commit à l'enregistrement » ; « Supprimer » (ghost, texte `--muted-foreground` comme la maquette l.98, `--destructive` au survol, icône `delete`) à gauche en modification ; « Annuler » `outline` ; principal « Enregistrer dans la spec » / « Enregistrer les modifications » (icône `check`), 36 de haut (44 sous 768). |
| Encadré « Décrire en une phrase » | Création seulement : contour pointillé `--primary`, fond `--diff-bg`, rayon 12, titre 13/600 icône `wand_stars` 18 (l'`auto_awesome` des planches, §4), zone de texte 2 lignes (`rows`, B332) dans un cadre rayon 10 + « Préremplir » (32, rayon 8, `--primary`, toujours actif : phrase vide, message d'aide), note « Rien n'est enregistré tant que vous n'avez pas cliqué sur « Enregistrer ». ». |
| Bandeau « Préremplie par l'agent » | `role="status"`, `--surface`, bordure, rayon 10, 13 px, « Effacer » souligné 600 (26 de haut, cible 24 minimum). |
| `Field` + `agentFilled` | Marqueur sur tout le bloc (libellé, champ, aide) : filet gauche 3 `--primary`, retrait 12, « proposé par l'agent » 11 px `--primary` à côté du libellé. Jamais le filet dans la bordure du champ. « * » `--primary` + `aria-label="obligatoire"`. |
| `TagInput` (`packages/ui`, combobox maison : l'appelant fournit `suggestions`, `onQueryChange`, `validate`) | Puces de références : cadre 40 mini, rayon 8, puces 24 mono 12 `--soft` / `--soft-foreground` avec ✕ (bouton nommé « Retirer R-001 »), saisie « Ajouter… » 13, liste d'autocomplétion `role="listbox"` (20 résultats au plus, anti-rebond 200 ms, `aria-activedescendant`, annonce du nombre de résultats). |
| Choix en pastilles (`RadioPillGroup` / `RadioPill`, variante des radios) | 32 de haut (44 sous 768), rayon plein, 13/500 ; choisie : bordure `--primary`, fond `--secondary`, texte `--secondary-foreground` ; `role="radiogroup"`. |
| Avertissement et erreurs | `InlineAlert` attention en `role="note"` (livrable validé, B332) et erreur (résumé « N champs obligatoires sont vides : … », `role="alert"`, focus sur le premier champ en erreur) ; sous le champ « Obligatoire » 12/500 rouge, icône `error` 16. |
| Fermeture | Échap, fond ou « Annuler » : si la saisie diffère de l'état d'ouverture, `AlertDialog` « Fermer sans enregistrer ? » (la saisie reste gardée en brouillon sur cet appareil) ; ⌘ / Ctrl + Entrée enregistre. |

Galerie : `/dev/ui`, section « 17. Panneau d'édition » (la 16 est déjà « Propositions de l'agent ») (id `dev-ui-spec-item-sheet`) : les 4 modes, en clair, en sombre et à 375 px. Maquette 16 : le toast « F-249 enregistrée dans la spec · commit e4c90a1 » est le `Toast` Radix existant (pas de Sonner).

### 5.15 Collection de la spec et page Fonctionnel (v2.17, TK-102, passation 06 §3-4.4, B333, B334, maquette 10 l.59-223)

| Composant | Règle |
|---|---|
| `SpecCollection` | Liste à gauche (`flex 999 1 420px`, cadre rayon 12, lignes 52, `VirtualList`) et fiche ancrée à droite (380 à 440 px, bordure gauche `--border`). Sous 1280 px la fiche est un panneau superposé, sous 1024 px liste puis fiche plein écran (« ← Liste »). Ligne choisie : fond `--secondary`. |
| `DeliverableStatus` | Variantes `ready` (« Prêt », `arrow_forward`, teinte `--secondary`) et `generating` (« Génération », `progress_activity`, `motion-safe:animate-spin`) en plus de celles de §5.1. |
| `SpecNav` | Pastille de badge par entrée (11/600, rayon 999, `1px 7px`) : « Prêt » `--secondary`, « … » `--secondary` pendant la génération, « N à relire » `--primary`, « À valider » ambre. |
| Ligne de fonctionnalité | `IdTag`, titre 500 et « N critères », `PriorityIndicator` avec libellé (112 px), `ValidationStatus`. Sous 768 px, priorité et validation passent sous le titre. |
| Fiche ancrée | Région `aside` « Fiche de la fonctionnalité » : `IdTag`, validation, « Modifier », titre 20/600 (`text-settings-title`), `LifecycleStatus` (aligné à gauche), description, critères (`ProposalDetailLines plain ordered`, « AC-n · Étant donné …, quand …, alors … » d'un trait), Liens (titre 12/600 capitales, une `EntityChip` par entité, sans groupes ni lien faute de page cible), pied « Enregistrée dans la spec · fichier ». Fermeture : « Fermer la fiche » (visible sous 1024 px, croix de 1024 à 1279 px), Échap. |
| `TabsNav` / `ProjectHeader` | `count` accepte un texte (« … », « 3 à relire ») et `countTone: "primary"` ; icône 16 px par onglet (`task_alt`, `gavel`, `admin_panel_settings`, `route`) ; nombres formatés (« 1 000 »). |
| Filtres | `FilterChip` pointillés Validation, Priorité, Avancement ouvrant un menu à choix unique ; la pastille nomme le choix. |

Galerie : `/dev/ui`, section « 18. Collection de la spec ». La vue client de ce cahier (validation un par un) n'est pas dans ce ticket.

### 5.16 Règles métier, Rôles et permissions, Parcours (v2.18, TK-103, passation 06 §4.3-4.4 et §9, 08 §1.1, 11 §3-4, B338 à B344, maquette 10 l.225-318, 335-382, 532-541, 581-621, 722-740)

| Composant | Règle |
|---|---|
| `RuleCard` | `article` rayon 12, bordure `--border`, marges 16, écart 10, fond `--background`, dans une grille `repeat(auto-fill, minmax(420px, 1fr))` écart 12 (1 colonne sous 1024 px). Ligne d'en-tête : `IdTag` `R-nnn`, titre 15/600, `Pill soft` du type (icône 16 : `block` Contrainte, `calculate` Calcul, `account_tree` Workflow à états), icône `edit` 28 `aria-label="Modifier R-002"` pour l'équipe qui écrit. Énoncé 14/1,55 dans un encadré `--surface` rayon 8 marges 10 12 ; « Exemple » 12/600 `--muted-foreground` puis 13 ; « Appliquée par » 12 et `IdTag` `F-nnn`. Carte choisie (`?sel=`) : bordure `--primary`. |
| `WorkflowStates` | Liste (`ul`, `aria-label` « États de la règle », lue dans l'ordre) en ligne 12 px : état initial plein `--primary` / `--primary-foreground`, flèche `arrow_forward` 16 `--muted-foreground` (`aria-hidden`), états finaux en contour `--border` ; chaque état rayon 6 marges 3 8. L'ordre du fichier fait foi (le premier est l'état initial). |
| Légende des types (`RuleTypeLegend`) | Trois pastilles à contour (`pillVariants` `outline`) à icône 16, boutons `aria-pressed` dans un groupe nommé « Filtrer par type de règle » qui filtrent (`?type=`) ; un second appui sur le type actif retire le filtre ; actif : bordure `--primary`, fond `--secondary` ; 44 px de haut sous 768 px. |
| `RoleCard` | Rayon 12, marges 14 16, écart 12, grille `minmax(260px, 1fr)` ; `IconTile` 40 au contour (teintes cycliques `warning`, `soft`, `success` en jetons de statut, icône décorative), nom 600, `IdTag` mono 11 `RL-…` en `--muted-foreground`, description 13 `--muted-foreground`, icône `edit` 28. |
| `PermissionMatrix` | Vrai `table` dans un cadre rayon 12 à défilement horizontal (région `tabIndex=0` nommée), `min-width` 640. `caption` 14/600 (« Qui peut faire quoi ») avec le total d'actions, la mention « groupées par ressource au-delà de 20 » et le champ « Filtrer les actions » ; `thead` `--surface` 12 `--muted-foreground` (`th scope="col"`, noms de rôle centrés) ; ligne : `th scope="row"` libellé + code `PM-…` mono 11 ; cellule : `check_circle` plein 18 (`--status-validated-fg`) + « autorisé » ; avec restriction `check_circle` `--primary` + « autorisé : les siennes » (texte de la restriction) ; `remove` 18 `--border-strong` + « non autorisé » ; le texte est visible à 12 px (lecteur d'écran et daltoniens). Au-delà de 20 actions : lignes de groupe `th scope="rowgroup"` (fond `--surface`, bouton chevron `aria-expanded`, « Paiement et caisse · 12 actions », ouvert sous 5 actions). |
| `FlowCard` | Section rayon 12, marges 16, écart 14 : `IdTag` `P-…`, `h3` 16/600, acteur 13 `--muted-foreground`, « Fonctionnalités : F-001, F-004 » 12 à droite, icône `edit`. |
| `FlowSteps` | `ol` sans puce, étapes en ligne qui passent à la ligne : carte 150 px, rayon 10, `--surface`, marges 10 12, « Étape n » 11 `--muted-foreground`, libellé 13/600, `IdTag` d'écran 11 ; flèche `arrow_forward` 20 `aria-hidden` entre les étapes. Sous 768 px : colonne, flèche `arrow_downward`. L'étape 1 est le point de départ. |
| `FlowError` | Fond `--alert-error-bg`, texte `--alert-error-fg` (mêmes valeurs que la maquette l.620 : `#fef2f2` / `#991b1b` en clair, `#3b1219` / `#fecaca` en sombre ; aucun jeton nouveau), rayon 8, marges 8 10, 13 px, icône `subdirectory_arrow_right` 18, « Étape 4 : » en 600 ; une ligne par cas d'erreur. |
| Pied de liste et recherche | `CountBar` « 300 règles · 24 chargées » avec « Rechercher une règle ou R-nnn » ; `ListFooter` (suite, chargement, erreur, fin) et bouton « Charger la suite » ; recherche vide : `EmptyState` compact avec « Effacer la recherche ». |

Relecture : `ProposalReview` générique (§5.13) ; le détail ajoute le type et l'exemple (règle), la liste « Permissions » (rôle), la liste « Étapes » (parcours) dans `ProposalLines`. Les compteurs d'onglet affichent « N à relire » en relecture.
Galerie : `/dev/ui`, section « 19. Règles, rôles et parcours » (`RuleCard`, `WorkflowStates`, `RuleTypeLegend`, `RoleCard`, `PermissionMatrix`, `FlowCard`, `FlowSteps`, `FlowError`). `PermissionMatrix` reçoit `filterRef` : le raccourci `/` de l'écran met le focus sur « Filtrer les actions ». Icônes ajoutées au registre : `calculate`, `shield_person`, `support_agent`.

### 5.17 Vue client et validation du cahier (v2.20, TK-104, passation 06 §4.5 et §5, 07 §1.4, B347 à B353, maquette 10 l.171-224, 296-330, 439-442, 566-580, 611-629, 637-648)

| Composant | Règle |
|---|---|
| `ValidationBanner` (à ajouter) | Bandeau `role=note` sous l'en-tête, marges 16 28, marges internes 12 14, rayon 10, jetons `--alert-warning-*` (maquette l.710 : `#fffbeb` / `#fcd34d` / `#78350f` clair, `#3a2a0c` / `#78350f` / `#fde68a` sombre), icône `fact_check` 20, texte 13 avec « Votre validation est attendue. » en 600, progression 13/600 à droite (« Fonctionnalités 12/248 · parcours 3/18 · règles et rôles 1/2 »). Variantes : `tone="warning"` (attente), `tone="neutral"` (business, lecture seule), texte propre à D1. |
| `ValidationPrompt` (à ajouter) | Question 14 + « Valider … » (`Button` principal 40 px, icône `check`) + « Demander un changement » (contour). Ouvre « Que faut-il changer ? » (`Textarea`, `Field`) + « Envoyer à l'équipe » / « Annuler ». Variantes de pose : `bar` (barre en pied d'onglet, fond `--surface`, bordure, rayon 12, marges 28), `inline` (sous une carte, filet haut). Cibles 44 px sous 768. |
| Confirmation de décision | `InlineAlert` variante `revise` (fond plein `--status-revise-*`, `role=status`, icône pleine `edit_note`) ou `validated` (`--status-validated-*`, `check_circle`), action « Annuler » (parcours et blocs seulement ; une fonctionnalité décidée ne s'annule pas). |
| `ReviewComment` (à ajouter) | Carte rayon 10, bordure, fond `--surface`, marges 10 12 : pastille ronde 26 d'initiales, « <nom> · demande de changement » 13/600, texte 13 (maquette l.207). |
| Fiche client | `IdTag`, `ValidationStatus`, h2 20/600, description 14/1.6, « Ce qui doit se passer » (`ol`, icône `check` 18, « Si … et que …, alors … »), « En lien avec » (`EntityChip` à libellé, jamais le code seul), puis `ValidationPrompt` `inline` et la note 12 « Votre validation porte sur la version du <date> · <7 caractères> ». Pas de jauge, pas de pied technique, pas de « Modifier ». |
| Hors maquette | Filtre « Non traitées » (`FilterChip`), « Aller à la suivante non traitée » (`Button` texte dans la ligne `role=status`), bandeau « N éléments ont changé depuis votre validation » (`InlineAlert` `warning`) : composés avec l'existant (B350) ; « Relancer <prénom> » (`Button` contour, icône `notifications`) et « Valider à la place du client » dans l'en-tête de la liste équipe (owner, admin ; B358). |

Galerie : `/dev/ui`, section « 20. Vue client » (`ValidationBanner`, `ValidationPrompt`, `InlineAlert revise`, `ReviewComment`).

### 5.18 Modèle de données (v2.22, TK-107, passation 09 §3, 11 §3, 08 §2.2, B383 à B392, maquette 11 l.91-122, 168-260, 404-412)

| Composant | Règle |
|---|---|
| `ErTableCard` | Carte de table du diagramme entité-relation : `button` `aria-pressed` nommé « Table Réservation, 6 champs » (TK-108 ; élément de liste jusqu'à TK-107), largeur 230, rayon 10, bordure 1 `--border`, fond `--background`, marge basse 6, rognée. En-tête (marges 8 10, écart 8, filet bas `--border`) : icône `table` 16, nom 13/600, identifiant mono 10 à 80 %, fond `--secondary` et texte `--secondary-foreground`. Une ligne de 22 par champ (marges 0 10, écart 6, 12) : icône 14 (`key` remplie ambre `--status-pending-icon` (#b45309 clair, #fde68a sombre, maquette 11 l.410) = clé primaire, `link` `--primary` = référence, `shield` `--muted-foreground` = donnée personnelle, sinon vide), nom mono, type mono 11 `--muted-foreground` (`ref(T-client)` rendu `→T-client`). États : `review` bordure en pointillés, `rejected` estompée par les jetons (fond `--surface`, texte `--muted-foreground`, nom barré ; jamais par l'opacité, un texte à 40 % échoue au contraste AA : écart assumé de la maquette 11 l.409) et doublée de la pastille texte « Rejetée », `selected` (TK-108) en-tête `--primary`, bordure 2, `--shadow-floating`. Réutilisée par le lecteur de TK-108. |
| Pastille « Données personnelles » | `Pill` md `warning` « Oui · NFR-001 », `outline` « Non » ; aucun style local. |
| Onglet Tables | `CountBar` + `SearchField` « Rechercher une table ou un champ », `Table` à en-tête collant (`--surface`, 12), lignes de 52, `IdTag` + nom, défilement interne (700 max), pages de 50, `ListFooter`. |
| Onglet Jeux d'exemple | Phrase d'aide 13, une section par jeu (rayon 12) : en-tête (`IdTag` `FX-…`, titre 600, méta « 3 lignes · T-client · locale fr-FR »), `Table` à colonnes mono, `Pagination` numérotée (25 par page). Données fictives. |

Compléments (TK-107, correction 1) : `CountBar` accepte `trailing` (contenu à droite de la même rangée : recherche de l'onglet Tables) ; `ListFooter` variante `attached` (pied dans le cadre du tableau, sans bord haut, coins bas arrondis, sous un `Table` `frameClassName="rounded-b-none"`) ; `Pagination` prop `density="sm"` (boutons 28, 44 sous 768 px, mono 12, écart 8, chevrons 16) ; `EmptyState` cadré : marges 32 / 28, écart 12, titre 15/600, marge haute 4 sur les boutons (maquettes 10 l.93 et 11 l.93) ; jeton `--status-pending-icon`. Les en-têtes de la liste ont un seul bouton primaire (l'agent) : « Ajouter une table » est en contour.

Compléments (TK-107, lot C) : `Pagination` sans `onSizeChange` impose la taille (« 25 lignes par page », jeux d'exemple) ; `DeliverableStatus` accepte `icon` (`groups` : « Validation de l'équipe · le client lit et commente ») ; `ProposalReview` accepte `summaryText` (bandeau « Mode relecture · l'agent propose N éléments depuis le cahier fonctionnel · A acceptés · P à relire ») ; `Table` encadré accepte `frameLabel` (région défilante focusable et nommée, 375 px).

Galerie : `/dev/ui`, section « 20. Modèle de données » (`ErTableCard` dans ses états, onglets Tables et Jeux). Icônes ajoutées au registre si absentes : `database`, `dataset`, `rate_review`, `verified` (non utilisé ici), `groups`.

### 5.19 Lecteur de diagramme (v2.23, TK-108, passation 09 §3.4 et §8, maquette 11 l.168-230, 376-412, 455-469, 507-531, B417 à B428)

| Composant | Règle |
|---|---|
| `DiagramViewer` | Lecteur SVG générique de `packages/ui` (nœuds de type libre, relations étiquetées, groupes `compound` prévus dans l'API) ; placement `@dagrejs/dagre` déterministe, positions enregistrées prioritaires. Cadre rayon 12, bordure `--border`, fond `--surface`, trame de points (`radial-gradient` 1 px `--border`, pas 20), défilement interne, hauteur disponible moins 24. SVG des relations `aria-hidden`, nœuds en `button` `aria-pressed`. |
| Relations | Traits droits entre centres sous les cartes : 1,5 `--border-strong`, pointillés `5 4` pour `n ↔ n` ; liées à la sélection : 2 `--primary` ; étiquette de cardinalité mono 11, fond `--background`, bordure. |
| `ErTableCard` | Devient un `button` `aria-pressed` (plus de `li` : contenu en `span`) : props `selected` (bordure 2 `--primary`, en-tête `--primary` / `--primary-foreground`, `--shadow-floating`), `onSelect`, `compact` (sous 60 % de zoom : noms seuls, le nom accessible garde « N champs »), `style`. `erTableHeight(n)` = 36 + 22 n + 6 donne la hauteur au placement. |
| Barre de zoom | `role="toolbar"` « Zoom du diagramme », en bas à droite : « − », pourcentage mono 12 (clic = 100 %), « + », filet, « Ajuster » (`fit_screen`), puis « Plein écran » quand l'écran le propose (`fullscreen` / `fullscreen_exit`, bouton bascule `aria-pressed`, B479). Fond `--background`, bordure, rayon 8, boutons 30 (44 sous 768 px). Paliers 50, 67, 75, 90, 100, 110, 125, 150, 200 ; `Ctrl/⌘ + − 0`, `Ctrl/⌘ + molette` ; pourcentage annoncé dans `role="status"`. Le cadre défilant garde un retrait bas de 56 px (72 px sous 768 px) que « Ajuster » retire de la hauteur utile : la barre ne recouvre jamais une carte (axe `target-size`). |
| Glisser | Équipe seulement, désactivé sous 768 px ; alternative clavier Alt + flèches (20 px, WCAG 2.5.7). |
| Fiche ancrée | `aside` 340 à 400 px (panneau superposé sous 1280 px) : `IdTag`, « Modifier », titre 20/600, `SegmentedControl` xs Fiche · YAML · Mermaid (équipe) ; YAML et Mermaid en `pre` mono 12, pastille `success` « Source de vérité » ou `soft` « Généré ». |

API : `DiagramViewer<T extends DiagramNode>` (`label`, `nodes`, `relations`, `renderNode`, `selectedId`, `onSelect`, `positions`, `onMove`, `initialZoom` palier ou `"fit"`, `onZoomChange`) ; sans `onMove`, pas de glisser (designer). Région défilante focusable et nommée, `role="status"` unique (« Zoom 100 % », « Réservation déplacée »), relations et étiquettes `aria-hidden`. Décision : [ADR 0022](docs/adr/0022-diagramme-svg-dagre.md).

Galerie : `/dev/ui`, section « 21. Diagramme » (lecteur équipe avec états, puis lecture seule à 50 %).

**Lisibilité et zones (v2.25, B476 à B478, maquette 11 l.170, 193, 474-487, 752-756)** : le placement automatique place chaque groupe de tables reliées avec dagre, replie en colonnes de 4 au plus un rang trop long (une table référencée par 30 autres ne trace plus une colonne), range les tables isolées en grille et dispose les blocs en étagères au rapport d'un écran (1,6). Les clés `ref(T-…)` comptent comme relations `n → 1`. Au-delà de 25 tables réparties en au moins deux zones (schéma 1.3 du §5.3), l'onglet s'ouvre sur la **vue des zones** : `ZoneNode` 300 × 180 (icône `folder_open`, `arrow_forward`, « N tables · cliquez pour ouvrir », « · p à relire » en relecture, 7 noms d'aperçu puis « +N »), traits entre zones étiquetés « 4 relations » en texte 12 (`labelFont: "sans"`), d'épaisseur 1 + n / 3 (6 au plus, `weight`). Au-dessus du lecteur : `nav` « Fil du diagramme » (« Toutes les zones · 48 tables » / zone ouverte en 600 · « 10 tables · 2 liens vers d'autres zones » en 12 `--muted-foreground`) et « Aller à une table… » (260 px, `SearchField` à suggestions, `Kbd` « / »). La zone ouverte vit dans `?zone=` (la même que le filtre de l'onglet Tables), un lien `?sel=` ouvre la zone de la table. `DiagramViewer` prend `minimap` : `DiagramMinimap` en bas à gauche, 150 de large et 154 de haut au plus (un plan haut se réduit), masquée sous 768 px.

**Zones voisines et plein écran (v2.26, B479, B480)** : dans une zone ouverte, chaque zone reliée est une carte `ZoneNode` 260 × 96 sur `--surface` (nom, « N tables · k relations · ouvrir », `arrow_forward`), reliée en pointillés à chaque table de la zone qui la vise (étiquette « 2 relations » au-delà d'une) ; un clic passe à cette zone (`?zone=`), on navigue ainsi de zone en zone au détail des tables. Ces cartes se déplacent à l'écran sans être enregistrées. « Plein écran » : l'onglet (fil, aide, lecteur, fiche) devient un calque `fixed inset-0` sur `--background`, marges 16, lecteur à la hauteur de la fenêtre moins 112 ; le navigateur passe en plein écran au mieux (document entier, pour que la fiche en panneau reste visible). Échap ou la sortie du plein écran du navigateur le referme ; une fenêtre de dialogue ouverte garde son Échap. Le compteur de relations de l'en-tête et la colonne Relations comptent aussi les clés `ref(T-…)` (une fois par paire de tables), comme le diagramme.

**Positions par vue (v2.27, B481)** : une vue (toutes les tables, ou une zone) n'applique les positions de `data/_layout.yaml` que si chacune de ses tables en a une ; sinon le placement automatique, jamais un mélange (qui superposait des cartes). Un déplacement enregistre le coin de toutes les tables de la vue, placement automatique compris : la vue devient entièrement manuelle.

### 5.20 Validation du modèle et vue client des Données (v2.24, TK-109, passation 09 §3.5, §3.6, §4, §6, §7, maquette 11 l.160-167, 209-219, 595-596, 625-648, B444 à B455)

| Composant | Règle |
|---|---|
| « Valider le modèle » | `Button` primaire, icône `verified` 20, première action de l'en-tête tant que le livrable est « À valider » (l'agent passe en outline) ; absent pour le designer, le client et le business. Validé : `DeliverableStatus` `validated` « Validé par l'équipe » + résumé « Validé par <prénom> le 5 nov. · version 3c7e1a9 » (équipe seulement). |
| Impact amont | `InlineAlert warning` (jetons `--alert-warning-*`, teintes de la maquette 11 l.652) : « Le cahier fonctionnel a changé : F-002, R-004 modifiées » + action « Proposer les mises à jour » ; statut `DeliverableStatus` `revise`. |
| Lecture seule | `InlineAlert` variante **`readonly`** (ajoutée, TK-109) : `role="note"`, fond `--surface`, bordure `--border`, dans les deux thèmes, icône `visibility` **20** `--muted-foreground`, rayon 10, marges 12 14 (`py-3 px-3.5`), écarts 10 / 14 avec retour à la ligne (texte en base 300 px : sous l'icône à 375 px), texte 13 avec « Lecture seule. » en 600 ; marges extérieures de la page (16 / 32 par `PageBody`). Le business lit la même phrase sans l'invitation à commenter. |
| Fiche client | Même `aside` que la fiche équipe (§5.19) sans « Modifier » ni sélecteur Fiche / YAML / Mermaid ; « Ce qu'on enregistre » (13/600) en liste à puces 14 depuis `clientSummary` ; « Commenter » = `Button` outline 30, icône `add_comment` 16, ouvre un dialogue (textarea, « Envoyer »). |

| Vue client | `DataClientView` : en-tête « Validé par l'équipe » + « N tables · lecture seule » + « Commenter » (44 sous 768 px ; vise la table choisie, sinon la première), onglets Diagramme / Tables / Jeux d'exemple sans Relecture, bandeau `readonly`. Non validé : `EmptyState` `schedule` « Le modèle de données n'est pas encore validé », sans onglet lu. Tables : même tableau que l'équipe, le nom ouvre la fiche dans le diagramme (« Voir la fiche de T-client, Client »). Dialogue « Commenter la table « X » » : `Dialog` + `Textarea` « Votre commentaire », « Envoyer » / « Annuler », échec en `InlineAlert error` avec focus au champ, annonce « Commentaire envoyé » dans l'unique `role="status"` de la page. Icône `add_comment` ajoutée au registre. |

Galerie : `/dev/ui`, section « 22. Vue client des Données » (id `dev-ui-data-client` : bandeau Lecture seule, fiche client).

## 6. Écrans maquettés

| Écran | État |
|---|---|
| Features et validation (vue client) | Maquetté en thème Indigo, clair et sombre (« Features · thème Indigo ») |
| Aperçu d'écran en mode annotation | Maquetté, **base neutre à reprendre en Indigo** |
| Change request et impact | Maquetté, **base neutre à reprendre en Indigo** |
| Kanban des tickets | Proposé, non maquetté |
| Fondations v2 (jetons, statuts, composants signature) | Planche « Lot 0 · Fondations v2 », clair et sombre ; galerie `/dev/ui` |
| Liste des projets et création | Planche « Lot 4 · Projets » (`08-Lot4Projects.html`) ; fiche `S-projects` v7 |
| Vue d'ensemble du projet | Planche « Lot 3 · Vue d'ensemble » (`07-Lot3Overview.html`) ; fiche `S-overview` |
| Modèle de données (Prêt, Génération, Relecture, Liste · équipe, Validé, À revoir, Vue client, onglets Diagramme, Tables et Jeux d'exemple) | Planche « Lot 6 · Données » (`11-Lot6Donnees.html`) ; fiche `S-spec-data` |
| Cahier fonctionnel (Prêt, Génération, Relecture, Liste · équipe) | Planche « Lot 5 · Fonctionnel » (`10-Lot5Fonctionnel.html`) ; fiche `S-spec-functional` |
| Coquille de l'application (barre, SPEC, `ProjectHeader`, ⌘K) | Planche « Lot 1 · Shell projet et navigation » (`05-Lot1Shell.html`, barre : `10-Lot5Fonctionnel.html`) ; fiche `S-app-shell` |

Les écrans des lots suivants de la refonte sont maquettés dans `docs/refonte/maquettes/` (planches 05 à 25).

## 7. Accessibilité

- WCAG 2.2 niveau AA ; contraste AA minimum pour tous les textes, y compris les petits libellés.
- Statuts doublés d'une forme (icône, jauge, barres) et d'un libellé, jamais la couleur seule. Les formes décoratives sont `aria-hidden`.
- Éléments interactifs en vrais `button` / `a` / `input` avec `label` ; boutons d'icône avec `aria-label`.
- Un bouton désactivé durablement est décrit par sa raison (`aria-describedby`).
- Un contenu au survol (`HoverCard`) s'ouvre aussi au focus, se ferme par Échap, et n'est jamais le seul accès à une information.
- Écrans vérifiés par axe en clair et en sombre, à 1280 px et à 375 px, sans défilement horizontal à 375 px.
- Variante **mouvement réduit** exigée pour toute animation (règle 12 de la spec).

## 8. Questions ouvertes

1. Réglage final de l'accent (voir 2.1).
2. Couleur de `--destructive` en clair et en sombre : à choisir et à tester.
3. Logo et marque : aucun travail fait. Le « K » de la maquette est un repère temporaire.
4. Thème par défaut (clair ou sombre) selon le profil : client plutôt clair, équipe plutôt sombre ?
5. Reprise des écrans « Aperçu annoté » et « Change request » en Indigo.
6. Export des tokens au format DTCG pour la bibliothèque d'organisation de Koklo.
7. Typographie et identité du site vitrine (serif éditorial en option).
8. Questions de la v2 : voir `docs/refonte/questions.md` (B22 à B36, C5).

## 9. Historique des décisions

| Date | Décision |
|---|---|
| 26/10/2026 | Abandon de l'ancienne identité (coq, orchestration d'agents) : repartir de zéro |
| 26/10/2026 | Interface en shadcn/ui |
| 26/10/2026 | Icônes : Material Symbols, style Rounded (Outlined essayé puis remplacé) |
| 26/10/2026 | Typographie : Instrument Sans + JetBrains Mono |
| 26/10/2026 | Couleur : Indigo retenu après essai de Forêt, écarté |
| 06/11/2026 | v2 (TK-87, passation 01 §0) : jetons `--surface`, `--raised`, `--border-strong`, `--diff-bg`, `--shadow-floating` ; couleurs d'alerte ; « Non soumise » ; échelle resserrée (h1 24, h2 16, h3 14) ; 8 composants de statut et signature ; bouton désactivé en pointillés avec raison ; règles d'écran 1 à 7 ; le fournisseur d'IA n'est jamais nommé dans l'interface (B15) |
| 06/11/2026 | v2.1 (TK-94, passation 07 §0 à §5) : §5.3 listes longues (`VirtualList`, `CountBar`, `ListFooter` à 4 états, `Pagination`, `GroupSection`, `DiagramMinimap`, `ZoneNode`), annonces et `aria-setsize` / `aria-posinset` |
| 07/11/2026 | v2.4 (TK-97, passation 19 §1) : §5.4 Réglages à navigation secondaire de 240 px par rôle ; thème Clair / Sombre / Système (B100) |
| 07/11/2026 | v2.2 (TK-88, passation 01 §1, 05 §2, 21 §0) : §5.4 coquille (`AppShell` 256 / 64 px collante, tiroir sous 768 px, groupe SPEC à sept entrées numérotées avec cadenas et sans chevron, `ProjectHeader` à trois lignes avec onglets en liens, palette ⌘K à recherche serveur, pages « Bientôt ») ; `--sidebar` passe sur `--surface` (B29) ; fil d'Ariane v1 retiré |
| 07/11/2026 | v2.3 (TK-88, finition) : §5.4 pied de barre épinglé, clavier de la palette (focus rendu, première option active, filtrage des pages à la frappe, liste masquée sans option), ombre et défilement visible du kanban, `smart_toy` pour l'Assistant de cadrage ; l'annonce du compte à rebours de S-framing devient `sr-only` (un seul « Réessayez dans N s » à l'écran, règle 5) |
| 07/11/2026 | v2.6 (TK-138, catalogue des composants, B143 et B144) : §4 tailles 14 et 24, `tone`, correspondances `wand_stars` et `keyboard_arrow_down` ; §5 rayons 10 et 14, hauteurs de boutons et de champs ; §5.1 alertes 10, `EmptyState` à action secondaire ; §5.3 pagination segmentée, pied de liste avec `Spinner` ; §5.4 compteur 11/600, initiales 12/700, navigation des Réglages sur `--secondary`, fil d'Ariane ; §5.5 primitives de base |
| 07/11/2026 | v2.7 (TK-139, catalogue §1.3 et §1.4, B152 à B157) : §5.6 surfaces et retours d'état (`Card` à 6 variantes, `StatCard`, `ProgressBar`, `InlineAlert` success et agent, `EmptyState inline`, `SkeletonRow`, `Toast`, `Dialog` / `AlertDialog`, `Sheet` 440 / 540 / 620, `Tabs underline`, `Table framed` et `YesNoCell`) ; `Alert` déprécié |
| 07/11/2026 | v2.8 (TK-140, catalogue §1.4, I15, I18, I21, I22, I28, I29, B160 à B166) : §5.3 pagination segmentée, pied de liste d'une ligne, `GroupSection stacked`, `CountBar` à requête ; §5.4 `PageHeader`, « Déplier la barre » ; §5.7 listes et navigation (`ListPanel`, `ListRow`, `ProjectHeader` à `status`, `PhaseRail inline`, `ShellNavGroup`, `ShellNavItem count`, `SecondaryNav`) |
| 08/11/2026 | v2.9 (TK-141, reprise des écrans sur les bases ; B171 et suivantes) : aucun composant nouveau attendu ; §5.4 Réglages et Fournisseurs d'IA précisés (tons des pastilles, `Toast` à la place de `role=status`) ; les écrans S-app-shell, S-features, S-settings et S-ai-settings suivent les planches 05, 10, 12 et 24 sans style local |
| 08/11/2026 | v2.10 (TK-89, passation 02, maquette 06) : §5.8 espace Idée (`ReorderableList`, `PageStatus`, `StatusLegend`, `Prose`, `TaskItem`, `AvatarGroup`, rail replié par défaut) ; la jauge de maturité reste à TK-91 |
| 08/11/2026 | v2.11 (TK-90, passation 02, maquette 06) : §5.9 agent de l'espace Idée (`AgentPanel`, `ChatBubble`, `AgentComposer`, `ProposalDiff`, `DecisionNotice`, `ProposedPageCard`, `ProposedPageList`, `AgentGapsCard`) ; icônes `explore` et `stop` ajoutées |
| 09/11/2026 | v2.12 (TK-91, passation 02 §9, décision 05 §2 « Lot 2 », maquette 06) : §5.10 maturité, Synthèse et passage au cadrage (`MaturityMeter`, `SynthesisNavItem`, « Passer au cadrage », bandeau « Modifié depuis idea-vN ») |
| 09/11/2026 | v2.13 (TK-92, passation 03, décision 05 §2 « Lot 3 », maquette 07) : §5.11 vue d'ensemble (`SegmentedGauge`, `NextStep`, `DeliverableCard`, `DeliverableStatus` « À revoir », `ActivityFeed`, `PersonRow`, `TicketStatus`) |
| 09/11/2026 | v2.14 (TK-93, passation 04, maquette 08) : §5.12 liste des projets et création (`ProjectTile`, `PhasePill`, `ProgressChecklist`, `ProjectCard`, teintes `--hue-1..5`, groupe « Récents ») ; lot B : `ShellNavItem leading`, `SegmentedGauge max`, `AvatarGroup size`, `hues.css` |
| 11/11/2026 | v2.15 (TK-99b, passations 14 et 07 §1.4, maquettes 21, 10, 12) : §5.13 propositions de l'agent (`AgentProposeButton`, `AgentProposePopover`, `ProposalReview`, relecture en volume) ; le bouton reste `--primary` partout (maquette 21 l'emporte sur le contour de la maquette 10) |
| 12/11/2026 | v2.16 (TK-101, passation 11, B329, maquette 16) : §5.14 panneau d'édition (`SpecItemSheet`, `Field agentFilled`, `TagInput`, choix en pastilles, confirmation de fermeture) ; plein écran sous 768 (et non 640) pour ce panneau |
| 12/11/2026 | v2.17 (TK-102, passation 06, B333, maquette 10) : §5.15 collection de la spec (`SpecCollection` à fiche ancrée, statuts « Prêt » et « Génération », badge de `SpecNav`) ; Assistant de cadrage retiré |
| 12/11/2026 | v2.18 (TK-103, passations 06 et 11, B338 à B344, maquette 10) : §5.16 règles métier, rôles et permissions, parcours (`RuleCard`, `WorkflowStates`, `RoleCard`, `PermissionMatrix`, `FlowCard`, `FlowSteps`, `FlowError`) ; compteurs et actions par onglet |
| 12/11/2026 | v2.19 : `ProgressBar` teinte `success` et part en cours `pending` ; avancement de l'enregistrement par lots dans le bandeau de relecture (sortie bloquée pendant l'écriture) |
| 12/11/2026 | v2.20 (TK-104, passation 06 §4.5, maquette 10) : §5.17 vue client et validation (`ValidationBanner`, `ValidationPrompt`, `InlineAlert revise`, `ReviewComment`) ; note de version « date · sha » seule exception au vocabulaire sans git (B348) |
| 13/11/2026 | v2.21 (TK-105, B364, B366, maquette 10 volume réel) : vue client, la recherche des fonctionnalités, règles (+ type) et parcours est faite par le serveur sur tout l'index (anti-rebond 250 ms, compte « N chargées » du serveur, « Aucune règle ne correspond à « x » ») ; formulaire d'élément : champ « Zone » facultatif (texte libre, 80 caractères, `Field` existant) ; aucun composant de `packages/ui` ajouté |
| 13/11/2026 | v2.22 (TK-107, passation 09, B383 à B392, maquette 11) : §5.18 modèle de données (`ErTableCard`, pastille de données personnelles, onglets Tables et Jeux d'exemple) ; diagramme interactif, fiche et validation renvoyés à TK-108 et TK-109 |
| 13/11/2026 | v2.23 (TK-108, passation 09 §3.4, B417 à B428, maquette 11) : §5.19 lecteur de diagramme (`DiagramViewer`, barre de zoom, fiche ancrée) ; `ErTableCard` devient un `button` sélectionnable |
| 13/11/2026 | v2.24 (TK-109, passation 09 §3.5-3.6 et §6, B444 à B455, maquette 11) : §5.20 validation du modèle, vue client en lecture seule, état « À revoir » (sans planche : teintes de la l.652) ; lot C : `InlineAlert readonly`, icône `add_comment`, `DataClientView` |
| 13/11/2026 | v2.25 (correctif staging, B476 à B478, maquette 11) : diagramme lisible (blocs, rangs repliés, étagères), relations des clés étrangères, vue des zones, fil, « Aller à une table… », mini-carte ; `ZoneNode` gagne `previewLimit`, `detail`, `arrow` |
| 13/11/2026 | v2.26 (correctif staging, B479, B480) : zones voisines dans une zone ouverte, plein écran du diagramme (icônes `fullscreen`, `fullscreen_exit`), compteurs de relations alignés sur le diagramme |
| 13/11/2026 | v2.27 (correctif staging, B481) : positions enregistrées appliquées par vue entière, un déplacement enregistre toute la vue |

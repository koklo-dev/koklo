<!-- Copie de koklo-new/cadrage/koklo-design-v0.1.md (source), aussi dans MyVault/koklo-v2/design.md. Mettre à jour la source puis recopier. v2 (TK-87) écrite d'abord ici : recopie vers les deux autres emplacements à faire par l'orchestrateur (docs/refonte/questions.md C5). -->
# Koklo : design (v2)

Décisions d'identité visuelle et d'interface de la plateforme Koklo (livraison produit de A à Z, web app + CLI). Document vivant : chaque décision porte son état (**retenu**, **à confirmer**, **écarté**).

Date : 26/10/2026 (v0.1) ; **v2 du 06/11/2026 (TK-87, lot 0 de la refonte)**. La v2 reporte la passation `docs/refonte/passations/01-lots-0-1-passation.md` §0.1 à §0.4, validée le 05/11/2026, et la décision B15 (`docs/refonte/questions.md`). En cas de contradiction avec une fiche `design/screens/*.md` antérieure, ce document l'emporte. Maquettes : canevas « Koklo — maquettes » (artefact privé, https://claude.ai/artifact/F6nuypdhrWp1Y7x8QwRiFm), planche **Lot 0 · Fondations v2** (copie : `docs/refonte/maquettes/04-Lot0Fondations.html`). Pour un agent, seul le texte de ce document fait foi.

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
4. Pas de nouvel écran ni de `Sheet` sans planche validée sur le canevas.
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
- Barre latérale sur `--surface`, contenu sur `--background`, éléments flottants (popover, menu, liste de `Select`, `Sheet`, infobulle, `HoverCard`) sur `--raised` avec `--shadow-floating` et une bordure `--border`. Aucun `shadow-md` ni `rgb(` dans un composant : le jeton seul. L'infobulle n'est plus inversée (fond `--foreground` en v1) : elle suit les autres éléments flottants, sur tous les écrans. Le passage de la barre latérale sur `--surface` se fait avec `AppShell` (lot 1, questions.md B29).
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
- Tailles (v2) : 16 (pastilles de statut, puces d'entité, bouton compact), 18 (`InlineAlert`, fil de phase), 20 (boutons, navigation), 22 (navigation), 28 (tuile d'`EmptyState`, galerie).

| Domaine | Icônes |
|---|---|
| Navigation | `home`, `checklist`, `web`, `account_tree`, `chat_bubble`, `bar_chart`, `view_kanban`, `lightbulb` |
| Validation | `task_alt`, `check_circle`, `schedule`, `edit_note`, `fact_check`, `remove` |
| Livrables | `radio_button_unchecked`, `edit`, `schedule`, `check_circle` |
| Entités (`EntityChip`) | `task_alt` (F), `web` (S), `view_kanban` (TK), `person` (RL), `table` (T), `gavel` (R), `api` (E), `commit` (SHA) |
| Phase | `check`, `lightbulb`, `edit_note`, `flag`, `sync` |
| Versions | `commit`, `call_split`, `merge`, `difference`, `history` |
| Données et technique | `database`, `api`, `palette`, `smart_toy`, `terminal` |
| Interface | `add`, `search`, `link`, `person`, `settings`, `lock`, `visibility`, `warning`, `error`, `unfold_more`, `light_mode`, `dark_mode` |
| Statuts de ticket (kanban, TK-35) | `inbox` (backlog), `radio_button_unchecked` (à faire), `play_circle` (en cours), `fact_check` (en revue), `block` (bloqué), `check_circle` (terminé), `cancel` (annulé) |

À ajouter au registre du générateur au lot 0 (`packages/ui/scripts/generate-icons.ts`) : `remove`, `edit`, `view_kanban`, `gavel`, `table`, `error`, `flag`, `sync`, `lightbulb`.

Mise en œuvre :
- shadcn/ui utilise **Lucide** dans ses composants (chevrons, coches, croix). Il faudra remplacer ces imports dans les composants copiés dans le projet.
- En production, ne pas embarquer la police d'icônes complète (lourde) : utiliser des **SVG chargés à la demande** (Iconify avec le jeu `material-symbols`, ou le paquet `@material-symbols/svg-400`).
- Dans la spec Koklo, les icônes sont des assets de type `icône`, référencés par identifiant (jamais de chemin libre), comme le prévoit la bibliothèque d'assets.

## 5. Formes et composants

- Rayons : boutons et champs **6 px**, puces d'entité **6 px**, alertes **8 px**, cartes **8–10 px**, aperçus **10 px**, panneaux et cadres (`EmptyState`, tableaux) **12 px**, pastilles de statut **pastille complète**. `--radius: 0.5rem` côté shadcn.
- Hauteurs : boutons et champs **36 px** (desktop). Cibles tactiles de **44 px** à prévoir en mobile (**à faire**) ; minimum WCAG 2.2 (2.5.8) de 24 px partout.
- Bordures d'un pixel en `--border` plutôt que des ombres ; `--shadow-floating` réservée aux éléments flottants.
- Mise en page : barre latérale de **248 px** (256 px au lot 1), panneau de détail de **380 à 440 px**, marge de page **32 px**. Les écrans « page » s'empilent sur mobile.
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

**`DeliverableStatus`** : statut d'un livrable du cadrage. À faire (`radio_button_unchecked`, neutre), En cours (`edit`, neutre), À valider (`schedule`, couleurs À valider), Validé (`check_circle`, couleurs Validée). Neutre = fond `--secondary`, texte `--foreground`. Même gabarit que `ValidationStatus` ; variante `compact` : texte 11 px, icône 16 px, libellé masquable visuellement mais toujours présent pour les lecteurs d'écran (barre latérale du lot 1).

**`PriorityIndicator`** : 3 barres verticales de 3 px (hauteurs 4, 8, 12 px, écart 2 px, rayon 1, alignées en bas), actives en `--foreground`, inactives en `--border-strong`, puis le libellé 13/500. Indispensable 3, Importante 2, Souhaitable 1, Reportée 0. Barres `aria-hidden` : le libellé porte le sens. Remplace le gras / gris v1. Les tickets réutilisent le composant avec leurs propres libellés (critique 3, haute 2, moyenne 1, basse 0 ; questions.md B23).

**`EntityChip`** : identifiant cliquable `F-nnn`, `S-slug`, `TK-nnn`, `RL-slug`, `T-slug`, `R-nnn`, `E-slug`, SHA (7 caractères).
- Toujours un vrai lien (`<a href>`). Hauteur 26 px, rayon 6, marges 0 8 0 6 px, écart 6 px, fond `--secondary`, texte `--secondary-foreground`, icône 16 px selon le type (§4), identifiant en JetBrains Mono 12/500, titre facultatif 12 px en `--foreground`.
- Survol **ou focus** : `HoverCard` sur `--raised`, bordure `--border`, rayon 10, marges 12 / 14 px, `--shadow-floating`, largeur 300 px au plus : titre 14/600 (« F-001 · Connexion par e-mail ») et une ligne de résumé 13 px `--muted-foreground` (« 3 critères · liée à S-login »). L'aperçu n'est jamais essentiel : tout ce qu'il dit est atteignable en suivant le lien.

**`InlineAlert`** : une ligne de 40 px au moins (marges 6 8 6 12 px, rayon 8, texte 13 px) : icône 18 px, texte, une action facultative (bouton texte souligné, 600, 28 px de haut). Variantes et rôles : neutre `role="note"`, attention `role="status"` (attente, compte à rebours), erreur `role="alert"` (échec). Couleurs : §2.2. Un détail dépliable sous la ligne si besoin : l'action « Détails » est alors un `button` avec `aria-expanded` et `aria-controls`, et c'est la seule action de la ligne.
- **Cas imposé : bloc d'envoi à l'agent IA** (passation 01, décision B15) : `InlineAlert` neutre, icône `lock`, texte « Votre texte est envoyé à l'agent IA avec la clé de l'organisation. », action « Détails » qui déplie le détail de ce qui est envoyé (fiche S-framing §3.2). Toujours dans le DOM avant toute requête. Jamais le nom d'un fournisseur.

**`EmptyState`** : cadre pointillé `--border-strong` sur `--surface`, rayon 12, marges 28 / 20 px, centré ; tuile d'icône de 48 px (rayon 12, `--secondary`, icône 28 en `--secondary-foreground`, décorative), titre 14/600, une phrase 13 px `--muted-foreground` (280 px au plus), **une seule** action principale.

**`PhaseRail`** : fil de phase Idée → Cadrage → Baseline 0 → Itérations. C'est la signature de Koklo.
- Grand : liste ordonnée ; pastille de 32 px par étape (terminée : `--primary` plein, icône `check` en `--primary-foreground` ; en cours : `--secondary`, anneau de 2 px `--primary`, icône de l'étape en `--secondary-foreground` ; à venir : `--surface` + bordure `--border`, icône de l'étape en `--muted-foreground`), trait de 2 px entre les étapes (`--primary` si l'étape est terminée, sinon `--border`), libellé 14/600 suivi de l'état en 400 `--muted-foreground` (« terminée », « en cours », « à venir »), sous-titre facultatif 13 px. Icônes d'étape 18 px : Idée `lightbulb`, Cadrage `edit_note`, Baseline 0 `flag`, Itérations `sync`. L'étape en cours porte `aria-current="step"`.
- Miniature (`size="sm"`) : pastille de 28 px, bordure `--border`, 12/500 ; 4 traits de 14 × 4 px (rayon 2, écart 3 px ; terminé `--primary`, en cours `--primary` à 45 %, à venir `--border-strong`) + « Cadrage · 2 sur 4 ».
- Phase calculée côté serveur ; si elle manque (lot 1), dériver : aucune fonctionnalité = Idée, pas de `baseline-0` = Cadrage, sinon Itérations.

### 5.2 Boutons (v2, retenu)

- Principal (`--primary`, texte `--primary-foreground`), secondaire (bordure `--border`, fond `--background`), discret (transparent). 36 px, rayon 6, 14/500, marges 0 14 px (0 14 0 12 avec une icône de 20 px).
- **Désactivé** : bordure **pointillée** `--border-strong`, fond `--surface`, texte `--muted-foreground`, quelle que soit la variante. Plus de lavande délavée (`opacity-50` supprimé).
- **Raison visible** : un bouton désactivé durablement (prérequis manquant, droits) a toujours sa raison à côté, en 13 px `--muted-foreground`, reliée par `aria-describedby`. Un bouton désactivé le temps d'une requête n'en a pas : la région d'état parle déjà (règle 5 ; questions.md B26).

## 6. Écrans maquettés

| Écran | État |
|---|---|
| Features et validation (vue client) | Maquetté en thème Indigo, clair et sombre (« Features · thème Indigo ») |
| Aperçu d'écran en mode annotation | Maquetté, **base neutre à reprendre en Indigo** |
| Change request et impact | Maquetté, **base neutre à reprendre en Indigo** |
| Kanban des tickets | Proposé, non maquetté |
| Fondations v2 (jetons, statuts, composants signature) | Planche « Lot 0 · Fondations v2 », clair et sombre ; galerie `/dev/ui` |

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
8. Questions de la v2 : voir `docs/refonte/questions.md` (B22 à B33, C5).

## 9. Historique des décisions

| Date | Décision |
|---|---|
| 26/10/2026 | Abandon de l'ancienne identité (coq, orchestration d'agents) : repartir de zéro |
| 26/10/2026 | Interface en shadcn/ui |
| 26/10/2026 | Icônes : Material Symbols, style Rounded (Outlined essayé puis remplacé) |
| 26/10/2026 | Typographie : Instrument Sans + JetBrains Mono |
| 26/10/2026 | Couleur : Indigo retenu après essai de Forêt, écarté |
| 06/11/2026 | v2 (TK-87, passation 01 §0) : jetons `--surface`, `--raised`, `--border-strong`, `--diff-bg`, `--shadow-floating` ; couleurs d'alerte ; « Non soumise » ; échelle resserrée (h1 24, h2 16, h3 14) ; 8 composants de statut et signature ; bouton désactivé en pointillés avec raison ; règles d'écran 1 à 7 ; le fournisseur d'IA n'est jamais nommé dans l'interface (B15) |

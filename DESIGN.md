<!-- Copie de koklo-new/cadrage/koklo-design-v0.1.md (source), aussi dans MyVault/koklo-v2/design.md. Mettre à jour la source puis recopier. -->
# Koklo : design (v0.1)

Décisions d'identité visuelle et d'interface de la plateforme Koklo (livraison produit de A à Z, web app + CLI). Document vivant : chaque décision porte son état (**retenu**, **à confirmer**, **écarté**).

Date : 26/10/2026. Maquettes : canevas « Koklo — maquettes » (artefact privé, https://claude.ai/artifact/F6nuypdhrWp1Y7x8QwRiFm).

## 1. Principes

- **Nouveau départ** : l'identité de l'ancien Koklo (orchestration d'agents, mascotte coq) est abandonnée. La marque se construit pour une plateforme de livraison produit.
- **shadcn/ui** pour les composants, réutilisés tels quels autant que possible (retenu).
- **Clair et sombre** dès le départ : le sombre est de première classe (CLI, agents, usage prolongé).
- **Jamais la couleur seule** : chaque statut a aussi une forme (icône), pour l'accessibilité et pour ne pas dépendre de la teinte.
- **Cible double** : une vue client (validation, sans vocabulaire git) et une vue équipe (données, API, tests). L'identité doit rassurer l'une sans paraître jouet à l'autre.

## 2. Couleurs : thème Indigo (retenu)

Un violet franc, volontairement éloigné du bleu classique des outils de gestion de projet. Le choix s'est fait entre Indigo et Forêt ; Forêt a été écarté après essai sur l'écran réel (rendu non satisfaisant). Cobalt et Vermillon n'ont pas été retenus.

### 2.1 Tokens (correspondance shadcn/ui)

```css
:root {
  --background: #ffffff;
  --foreground: #14102b;
  --card: #ffffff;
  --card-foreground: #14102b;
  --popover: #ffffff;
  --popover-foreground: #14102b;
  --primary: #5b3fd9;
  --primary-foreground: #ffffff;
  --secondary: #eeeaff;
  --secondary-foreground: #43299f;
  --muted: #f7f5ff;
  --muted-foreground: #55507a;
  --accent: #eeeaff;
  --accent-foreground: #43299f;
  --destructive: #b91c1c;          /* à confirmer */
  --border: #e6e1f8;
  --input: #e6e1f8;
  --ring: #5b3fd9;
  --radius: 0.5rem;
}

.dark {
  --background: #0d0b1c;
  --foreground: #f1efff;
  --card: #15122b;
  --card-foreground: #f1efff;
  --popover: #15122b;
  --popover-foreground: #f1efff;
  --primary: #9b87ff;
  --primary-foreground: #0d0b1c;
  --secondary: #231d4a;
  --secondary-foreground: #cbc1ff;
  --muted: #15122b;
  --muted-foreground: #a9a3d4;
  --accent: #231d4a;
  --accent-foreground: #cbc1ff;
  --destructive: #f87171;          /* à confirmer */
  --border: #2a2550;
  --input: #2a2550;
  --ring: #9b87ff;
}
```

L'accent (`--primary`) est réglable : variantes testées en clair `#5b3fd9` (défaut), `#6d3fe0`, `#4c3fd1`, `#7a3fd9` ; en sombre `#9b87ff` (défaut), `#a98bff`, `#8f87ff`, `#b48bff`. **À confirmer** après quelques jours d'usage.

### 2.2 Couleurs de statut (identiques quel que soit le thème de marque)

| Statut | Clair (fond / texte) | Sombre (fond / texte) | Icône |
|---|---|---|---|
| Validée | `#dcfce7` / `#166534` | `#14532d` / `#bbf7d0` | `check_circle` (pleine) |
| À valider | `#fef3c7` / `#92400e` | `#78350f` / `#fde68a` | `schedule` (pleine) |
| À revoir | `#fee2e2` / `#991b1b` | `#7f1d1d` / `#fecaca` | `edit_note` (pleine) |

Règle : la marque (violet) n'est jamais utilisée pour un statut ni pour une alerte. Les contrastes des paires texte/fond atteignent le niveau AA (4,5:1) ; à revérifier avec un outil avant la mise en production.

## 3. Typographie (retenu : association « Humaniste et nette »)

| Rôle | Police | Graisses | Licence |
|---|---|---|---|
| Interface et titres | **Instrument Sans** | 400, 500, 600, 700 | OFL |
| Code, identifiants (`F-001`, `S-register#n-email`), commandes | **JetBrains Mono** | 400, 500 | OFL |

Échelle utilisée dans les maquettes :

| Usage | Taille | Graisse | Interlettrage |
|---|---|---|---|
| Titre de page | 30 px | 600 | −0,025 em |
| Titre de section / panneau | 22–24 px | 600 | −0,015 em |
| Corps | 14–15 px | 400 | normal |
| Texte secondaire | 13 px | 400–500 | normal |
| Légende, badges | 12 px | 500 | normal |
| Code | 12 px | 400–500 | normal |

Écartées : Geist (trop neutre), Fraunces + Geist (serif éditorial), Bricolage Grotesque + Hanken Grotesk (trop expressif pour des tableaux denses). Le serif reste une option **pour le futur site vitrine**, pas pour l'application.

À faire en production : héberger les polices soi-même (par exemple Fontsource ou `next/font`) plutôt que de dépendre de Google Fonts au chargement.

## 4. Icônes : Material Symbols (retenu)

- Famille **Material Symbols Rounded** (Google, licence Apache 2.0) : angles et extrémités arrondis, en accord avec les rayons de l'interface. Le style Outlined a été essayé d'abord, puis remplacé.
- Réglages par défaut : graisse **400**, remplissage **0** (contour), `GRAD` 0, taille optique égale à la taille, entre 20 et 48.
- **Remplissage 1** pour l'état actif (élément de navigation sélectionné) et pour les icônes de statut.
- Tailles : 16 (inline dans un badge ou un bouton compact), 18 (statuts), 20 (boutons, navigation), 22 (navigation), 28 (galerie).

| Domaine | Icônes |
|---|---|
| Navigation | `home`, `checklist`, `web`, `account_tree`, `chat_bubble`, `bar_chart` |
| Validation | `task_alt`, `check_circle`, `schedule`, `edit_note`, `fact_check` |
| Versions | `commit`, `call_split`, `merge`, `difference`, `history` |
| Données et technique | `database`, `api`, `palette`, `smart_toy`, `terminal` |
| Interface | `add`, `search`, `link`, `person`, `settings`, `lock`, `visibility`, `warning`, `unfold_more`, `light_mode`, `dark_mode` |

Mise en œuvre :
- shadcn/ui utilise **Lucide** dans ses composants (chevrons, coches, croix). Il faudra remplacer ces imports dans les composants copiés dans le projet.
- En production, ne pas embarquer la police d'icônes complète (lourde) : utiliser des **SVG chargés à la demande** (Iconify avec le jeu `material-symbols`, ou le paquet `@material-symbols/svg-400`).
- Dans la spec Koklo, les icônes sont des assets de type `icône`, référencés par identifiant (jamais de chemin libre), comme le prévoit la bibliothèque d'assets.

## 5. Formes et composants

- Rayons : boutons et champs **6 px**, cartes **8–10 px**, panneaux **10–12 px**, badges **pastille complète**. `--radius: 0.5rem` côté shadcn.
- Hauteurs : boutons et champs **36–38 px** (desktop). Cibles tactiles de **44 px** à prévoir en mobile (**à faire**).
- Bordures d'un pixel en `--border` plutôt que des ombres ; ombre légère réservée aux éléments flottants.
- Mise en page : barre latérale de **248 px**, panneau de détail de **380 à 440 px**, marge de page **32 px**. Les écrans « page » s'empilent sur mobile.
- Composants shadcn/ui prévus : `Table`, `Badge`, `Tabs`, `Button`, `Sheet`, `Card`, `Accordion`, `Alert`, `Select`, `Popover`, `Resizable`, `Avatar`, `DropdownMenu`.

## 6. Écrans maquettés

| Écran | État |
|---|---|
| Features et validation (vue client) | Maquetté en thème Indigo, clair et sombre (« Features · thème Indigo ») |
| Aperçu d'écran en mode annotation | Maquetté, **base neutre à reprendre en Indigo** |
| Change request et impact | Maquetté, **base neutre à reprendre en Indigo** |
| Kanban des tickets | Proposé, non maquetté |

Les trois premiers écrans du canevas utilisent encore une base neutre ; seule la planche « Features · thème Indigo » applique l'identité.

## 7. Accessibilité

- Contraste AA minimum pour tous les textes, y compris les petits libellés.
- Statuts doublés d'une forme (icône), jamais la couleur seule.
- Éléments interactifs en vrais `button` / `a` / `input` avec `label` ; boutons d'icône avec `aria-label`.
- Variante **mouvement réduit** exigée pour toute animation (règle 12 de la spec).

## 8. Questions ouvertes

1. Réglage final de l'accent (voir 2.1).
2. Couleur de `--destructive` en clair et en sombre : à choisir et à tester.
3. Logo et marque : aucun travail fait. Le « K » de la maquette est un repère temporaire.
4. Thème par défaut (clair ou sombre) selon le profil : client plutôt clair, équipe plutôt sombre ?
5. Reprise des écrans « Aperçu annoté » et « Change request » en Indigo.
6. Export des tokens au format DTCG pour la bibliothèque d'organisation de Koklo.
7. Typographie et identité du site vitrine (serif éditorial en option).

## 9. Historique des décisions

| Date | Décision |
|---|---|
| 26/10/2026 | Abandon de l'ancienne identité (coq, orchestration d'agents) : repartir de zéro |
| 26/10/2026 | Interface en shadcn/ui |
| 26/10/2026 | Icônes : Material Symbols, style Rounded (Outlined essayé puis remplacé) |
| 26/10/2026 | Typographie : Instrument Sans + JetBrains Mono |
| 26/10/2026 | Couleur : Indigo retenu après essai de Forêt, écarté |

# Décisions du 05/11/2026 : agent dans la spec, suppression du brief

> Validé par Brice le 05/11/2026. Ce fichier **complète et corrige** les passations déjà écrites (`lots-0-1-passation.md`, `lot-2-idee-passation.md`, `lot-3-vue-ensemble-passation.md`). En cas de contradiction, ce fichier l'emporte.
> Maquettes : canevas « Koklo — maquettes » (https://claude.ai/artifact/F6nuypdhrWp1Y7x8QwRiFm). Planches mises à jour : lots 1, 2, 3, « Principe · agent dans la spec (référence) » et « Lot 5 · Fonctionnel » (référence de la barre latérale à jour).
> Plan : doc « Koklo — Refonte UI/UX et espace Idée : audit et plan » (https://claude.ai/artifact/3LVANUqXWDENdWVbhAiNRS).

## 1. Les décisions

1. **Pas d'écran « Assistant de cadrage »**. L'agent travaille dans la page de chaque livrable de la spec (bouton « Proposer avec l'agent », panneau d'agent, propositions affichées sur place). S-framing est remplacé par ce fonctionnement à partir du lot 5.
2. **Trois formes d'affichage, trois composants** réutilisés par tous les livrables :
   - `SpecDocument` (documents Markdown : vue d'architecture, ADR, cahier technique) = l'éditeur et le panneau d'agent de l'espace Idée ;
   - `SpecCollection` + `ProposalReview` (éléments typés : fonctionnalités, règles, rôles, parcours, tables, relations, endpoints, exigences, scénarios) = liste + détail, avec un mode relecture quand l'agent propose ;
   - `ScreenGallery` (design : écrans, parcours, design system).
3. **Pas de brief**. Il doublonnait le dossier d'idée.
   - « Passer au cadrage » **fige une version du dossier** : tag git `idea-v1` (puis `idea-v2`…) sur le dépôt de spec. Cette version sert de référence pour l'impact amont (si le dossier change après, les livrables concernés passent en « À revoir »).
   - Une page **Synthèse** est **générée** en tête du dossier d'idée : une page de résumé, en lecture seule, régénérée à chaque version figée. Elle sert au client (lecture rapide) et de contexte compact pour l'agent. Aucune acceptation requise.
   - Les questions encore ouvertes restent dans le dossier (page Hypothèses et risques) ; « Passer au cadrage » les rappelle sans bloquer.
4. **Six livrables dans l'ordre de rédaction** : 1 Fonctionnel, 2 Données, 3 Architecture, 4 Technique, 5 Design, 6 Qualité.
5. **Un lot par livrable**, chacun avec sa planche recettée visuellement avant sa passation : lot 5 Fonctionnel (avec le socle commun), 6 Données, 7 Architecture, 8 Technique, 9 Design, 10 Qualité, 11 Validation et Baseline 0, 12 Tickets, 13 Accès et réglages.
6. **Export des livrables** (PDF, Word, Markdown, pour le client et le devis) : plus tard.
7. **Barre latérale allégée** (retour de recette) : le groupe s'appelle simplement **« Spec »** ; une entrée indisponible n'a plus de seconde ligne.

## 2. Corrections à appliquer aux lots déjà spécifiés

### Lot 1 (`lots-0-1-passation.md`)
- Groupe de la barre : en-tête **« SPEC »** (11 px, 600, capitales, +0,06 em, `--muted-foreground`) et compteur mono « N/6 » à droite ; pas de chevron de repli. Entrées **numérotées** : 1 Fonctionnel, 2 Données, 3 Architecture, 4 Technique, 5 Design, 6 Qualité. Numéro mono 11 px `--muted-foreground` devant l'icône. Hauteur d'une entrée : 32 px (au lieu de 34), espacement 1 px.
- Entrée pas encore disponible : **une seule ligne**, libellé en `--muted-foreground`, petite icône `lock` 14 px en `--border-strong` à droite ; la condition (« Disponible après les données ») est dans l'infobulle (`title`) **et** dans l'`aria-label` (« Données, disponible après le fonctionnel »), `aria-disabled="true"`. Disponible mais pas commencée : statut « Prêt ».
- L'entrée **« Assistant de cadrage » reste au lot 1** (elle mène à S-framing tant que le lot 5 n'est pas livré) ; le lot 5 la retire et redirige `/projects/[id]/framing` vers Spec · Fonctionnel.
- Disponibilité (calculée côté serveur, `spec.deliverables`) : Fonctionnel quand `idea-v1` existe (ou, projet existant sans dossier, toujours) ; Données après Fonctionnel enregistré ; Architecture après Données ; Technique après Architecture ; Design après Fonctionnel ; Qualité après Fonctionnel et Technique. Owner / admin peuvent forcer (avec confirmation).

### Lot 2 (`lot-2-idee-passation.md`)
- **Page Synthèse** : première ligne de l'arborescence, au-dessus de la liste numérotée, non déplaçable, non supprimable : icône `auto_awesome` en `--primary`, libellé « Synthèse », étiquette « générée » (10 px, 600, bordure `--border`). Contenu : une page (vision en une phrase, problème, utilisateurs, périmètre de la première version, contraintes, mesure du succès, questions ouvertes restantes), générée par `ai.ideaSynthesis(projectId)` à chaque version figée, et à la demande (« Régénérer »). Lecture seule ; pas de proposition, pas de statut, pas comptée dans la jauge. Avant la première version figée : « La synthèse sera générée quand vous passerez au cadrage. » + « Générer un aperçu » (équipe).
- Fichier publié : `idea/_synthese.md` (en-tête `genere: true`, `source: idea-v1`).
- **« Passer au cadrage »** (§9) : publie une version si besoin, **pose le tag `idea-vN`**, génère la Synthèse, puis ouvre **Spec · Fonctionnel** en état « Prêt » (l'action principale y est « Proposer le fonctionnel »). Plus de `ai.draftBriefFromIdea`. S'il reste des questions ouvertes dans Hypothèses et risques : confirmation « Il reste 2 questions ouvertes dans le dossier. Passer au cadrage quand même ? [Passer au cadrage] [Revoir les questions] ».
- Après le passage au cadrage, le dossier reste modifiable. Une modification non figée affiche dans l'en-tête de l'Idée « Modifié depuis idea-v1 » + « Figer une nouvelle version » (équipe) ; figer une nouvelle version déclenche l'impact amont sur les livrables enregistrés.

### Lot 3 (`lot-3-vue-ensemble-passation.md`)
- Calcul de la phase (§4) : `idea` tant qu'aucune version `idea-vN` n'est figée et qu'aucune fonctionnalité n'existe ; `framing` ensuite (au lieu de « premier brief généré »).
- Sous-titre de l'étape Idée terminée : « Version idea-v1 figée le <date> ».
- Action principale en phase Cadrage : première entrée de la spec qui attend une action. Nouvelle règle de prochaine étape (entre 6 et 7) : « Proposer <livrable suivant> » quand un livrable vient d'être enregistré et que le suivant est disponible.
- Grille des livrables : 6 cartes (inchangé).

### Lot 4
- Aucun changement.

## 3. Ce qui vient ensuite

- **Lot 5 · Fonctionnel** : planche « Lot 5 · Fonctionnel (tous les états) » en recette ; elle couvre les 4 onglets (Fonctionnalités, Règles métier, Rôles et permissions, Parcours) dans les états Prêt, Génération, Relecture, Liste équipe et Vue client avec validation. Sa passation sera `design/refonte/lot-5-fonctionnel-passation.md`, après recette.
- La planche « Principe · agent dans la spec (référence) » montre les trois formes pour situer les lots suivants ; sa vue « Document · exemple » illustre `SpecDocument`.

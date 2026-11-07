# Refonte UI · Principe transversal · Créer et modifier un élément de la spec

> Validé par Brice le 05/11/2026 après recette visuelle.
> Maquette : canevas « Koklo — maquettes » (copie locale qui fait foi : `docs/refonte/maquettes/16-PrincipeEdition.html` ; lire le code avec `pnpm maquette <numéro>`), planche **Principe · créer et modifier un élément (panneau commun)** : 12 types × 4 modes (Création, Préremplie par l'agent, Modification, Erreurs). Le panneau est aussi branché dans les planches des lots 5 à 8 (boutons « Nouveau… », « Modifier », icône crayon des cartes d'exigence).
> **S'applique aux lots 5 à 13.** Tout bouton « Nouveau… » ou « Modifier » d'un élément de la spec ouvre ce panneau ; aucun bouton sans écran derrière.

## 1. Composant `SpecItemSheet`

- Panneau latéral droit de **540 px** (`Sheet` shadcn, `role="dialog"`, `aria-modal`, titre `h2` relié par `aria-labelledby`), fond `--background`, bordure gauche, ombre `-16px 0 40px rgba(20,16,43,.22)` ; la page reste visible derrière, assombrie (`rgba(13,11,28,.38)`). **Plein écran sous 768 px.**
- **En-tête** : tuile icône 36 px (`--secondary`), titre 18/600 (« Nouvelle exigence », « Modifier l'opération » : élision gérée), sous-titre 12 px (« Technique · identifiant attribué à l'enregistrement » / « Technique · NFR-003 »), identifiant en chip mono, fermer (`close`).
- **Corps** (défilement interne, marges 16 × 20) :
  - **Création** : encadré « Décrire en une phrase, l'agent remplit le formulaire » (contour pointillé `--primary`, fond `--diff-bg`, rayon 12) : zone de texte + « Préremplir » + « Rien n'est enregistré tant que vous n'avez pas cliqué sur « Enregistrer ». » (`ai.prefillItem({ type, description })`, texte brut seulement).
  - **Après préremplissage** : bandeau `role="status"` « Préremplie par l'agent. Vérifiez chaque champ marqué avant d'enregistrer. » + « Effacer ». Chaque champ rempli par l'agent : **filet gauche 3 px `--primary` sur tout le bloc** (libellé + champ + aide), retrait 12 px, et mention « proposé par l'agent » (11 px, `--primary`) à côté du libellé. Ne jamais mettre le filet dans la bordure du champ (il se perd dans l'arrondi).
  - **Modification d'un livrable validé** : `InlineAlert` attention en tête : « Ce livrable est validé : enregistrer cette modification annule sa validation, qui devra être reposée sur la nouvelle version. »
  - **Champs** : libellé 13/600 + « * » `--primary` si obligatoire ; contrôles 40 px rayon 8 : texte, texte mono (identifiants, adresses), zone de texte (redimensionnable verticalement), liste déroulante (`Select`), choix en pastilles (`ToggleGroup` / radio, 32 px), puces (références, avec ✕ et saisie « Ajouter… » + autocomplétion serveur) ; aide 12 px `--muted-foreground` sous le champ.
  - **Erreurs** (à l'enregistrement) : `InlineAlert` erreur en tête « 4 champs obligatoires sont vides : Titre, Priorité, … », bordure du champ en rouge, message « Obligatoire » sous le champ (`role="alert"`, icône `error`), focus sur le premier champ en erreur. Références inconnues signalées par le serveur au même endroit.
- **Pied** (`--surface`) : chemin du fichier écrit (mono) + « un commit à l'enregistrement » ; en modification « Supprimer » (`delete`, confirmation listant ce qui pointe vers l'élément) à gauche ; « Annuler » ; **« Enregistrer dans la spec »** / « Enregistrer les modifications » (principal).
- Après enregistrement : panneau fermé, toast « F-249 enregistrée dans la spec · commit e4c90a1 », élément sélectionné dans la liste.
- Clavier : focus piégé, Échap ou clic sur le fond ferme (confirmation si saisie non enregistrée), ⌘/Ctrl Entrée enregistre.

## 2. Règle d'enregistrement

Une saisie humaine **n'a pas de relecture** : « Enregistrer » envoie un `specBatch.submit` d'une opération (`<type>.create` / `.update` / `.delete`) et écrit le fichier indiqué. Le préremplissage de l'agent n'écrit rien. Les validations (Zod par type, références) sont les mêmes que pour les propositions de l'agent.

## 3. Formulaires par type

| Type | Lot | Fichier | Champs (* obligatoire) |
|---|---|---|---|
| Fonctionnalité | 5 | `features/F-nnn-<slug>.md` | Titre*, Priorité* (Indispensable, Importante, Souhaitable, Reportée), Description*, Critères d'acceptation* (un par ligne), Liens |
| Règle | 5 | `domain/rules/R-nnn-<slug>.md` | Titre*, Type* (Contrainte, Calcul, Workflow à états), Énoncé*, Exemple, Appliquée par |
| Rôle | 5 | `domain/roles.yaml` | Nom*, Description*, Permissions* (PM-…, restriction entre parenthèses) |
| Parcours | 5 | `design/flows/P-<slug>.json` | Titre*, Acteur*, Point de départ*, Étapes* (libellé · écran), Cas d'erreur, Fonctionnalités |
| Table | 6 | `data/tables/<slug>.yaml` | Nom*, Zone*, Description, Champs* (nom · type · contrainte), Données personnelles* (Non/Oui), Justifiée par |
| Composant | 7 | `architecture/components/<slug>.yaml` | Nom*, Type* (Application, Service, Stockage, File de tâches, Externe), Zone*, Responsabilité*, Possède les données, Dépend de, Sert les fonctionnalités |
| Décision | 7 | `architecture/adr/ADR-nnn-<slug>.md` | Titre* (« X plutôt que Y »), Statut* (Proposée, Acceptée, Remplacée), Contexte*, Décision*, Conséquences positives, À accepter, Alternatives écartées, Liens |
| Flux | 7 | `architecture/flows/<P-id>.yaml` | Parcours*, Participants*, Messages* (`de → vers : texte`, `←` retour, `alt :`, `---` séparateur), Liens |
| Choix technique | 8 | `tech/stack/<slug>.yaml` | Rôle*, Composants concernés*, Statut* (Choisi, À trancher), Choix retenu, Options comparées*, Critères*, Pourquoi*, Exigences visées |
| Opération | 8 | `api/endpoints/<nom>.yaml` | Nom* (mono, `zone.verbe`), Type* (Lecture, Écriture, Interne), Zone*, Résumé*, Permission*, Entrée*, Sortie*, Erreurs (CODE · quand · règle), Règles et fonctionnalités, Limite de débit |
| Exigence | 8 | `nfr/NFR-nnn.yaml` | Catégorie*, Titre*, Cible mesurable*, Énoncé*, Vérification* (Scénario du lot Qualité, Mesure en CI, Exercice manuel, À définir), Liens |
| Environnement | 8 | `tech/environments.yaml` | Nom*, Adresse*, Hébergement*, Base*, Données* (Jeux d'exemple, Copie anonymisée, Réelles), Déploiement*, Accès |

Les champs « liste par ligne » sont des éditeurs de lignes dans l'implémentation (ajout, suppression, réordonnancement) ; la maquette les montre en zone de texte.

## 4. Points d'entrée

- En-tête de chaque livrable : action « Nouveau… » selon l'onglet (Nouvelle fonctionnalité, Nouvelle règle, Nouveau rôle, Nouveau parcours, Ajouter une table, Nouveau composant, Nouvelle décision, Nouveau flux, Nouveau choix technique, Nouvelle opération, Nouvelle exigence, Nouvel environnement). Pas d'action d'ajout sur l'onglet Document (on y écrit directement).
- « Modifier » dans chaque fiche ; icône `edit` (28 px, `aria-label="Modifier NFR-003"`) sur les cartes (exigences, règles, rôles, parcours) ; « Modifier » sur le tableau des environnements.
- État vide « Ajouter une table » / « Écrire à la main » des états Prêt.
- Jamais pour le client (lecture et commentaires seulement).

## 5. Contrat

| Procédure | Usage |
|---|---|
| `ai.prefillItem({ projectId, type, description })` | valeurs proposées par champ, texte brut ; aucune écriture |
| `spec.item.get({ type, id })` | valeurs pour la modification + `validated` du livrable |
| `spec.refs.search({ projectId, kinds, q })` | autocomplétion des puces |
| `specBatch.submit` | une opération `<type>.create` / `.update` / `.delete` |

## 6. Critères d'acceptation

- [ ] Chaque bouton « Nouveau… » et « Modifier » des lots 5 à 8 ouvre `SpecItemSheet` avec le bon formulaire.
- [ ] Préremplissage par l'agent avec marquage des champs ; « Effacer ».
- [ ] Erreurs : résumé, champs en rouge, focus ; références vérifiées par le serveur.
- [ ] Avertissement d'invalidation en modification d'un livrable validé.
- [ ] Enregistrement = un commit, toast, élément sélectionné.
- [ ] Focus piégé, Échap, confirmation si saisie non enregistrée, plein écran sous 768 px ; axe sans violation.

## 7. Ticket

```
- [ ] **[TK-?]** Socle SpecItemSheet : panneau commun (création, préremplissage agent, modification, erreurs, suppression), 12 formulaires, ai.prefillItem, spec.item.get, spec.refs.search ; branchement des boutons des lots 5 à 8. Réf. design/refonte/principe-creer-modifier.md. `pkg:ui` `pkg:web` `pkg:api` `pkg:contract` — avec le socle du lot 5
```
